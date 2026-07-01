// Core business logic: ACT (average consultation time) and ETA calculation,
// shared by Reception, Doctor, and Queue Board views.
import {
  db, collection, query, where, orderBy, getDocs, getDoc, doc, updateDoc, onSnapshot, runTransaction
} from "./firebase-config.js";

const PATIENT_ID_PREFIX = "CLN";
const PATIENT_ID_PAD = 6;

/**
 * Generates a sequential, human-readable Patient ID (e.g. CLN-000001) using a
 * Firestore transaction against a single counters/patientId document, so two
 * simultaneous registrations (e.g. Reception + a self-service booking at the
 * same moment) never collide on the same number.
 */
export async function generatePatientId() {
  const counterRef = doc(db, "counters", "patientId");
  const newNumber = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? snap.data().value || 0 : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next });
    return next;
  });
  return `${PATIENT_ID_PREFIX}-${String(newNumber).padStart(PATIENT_ID_PAD, "0")}`;
}


export const DEFAULT_ACT_SECONDS = 8 * 60; // 8 min seed value until real history exists
export const ACT_WINDOW_N = 25;
export const NO_SHOW_GRACE_SECONDS = 3 * 60;

// Minimum and maximum plausible consultation durations.
// Below MIN → likely a false positive (accidental start/complete, data entry error).
// Above MAX → likely a forgotten completion (doctor never pressed Complete).
const ACT_MIN_SECONDS = 2 * 60;     //  2 min floor
const ACT_MAX_SECONDS = 90 * 60;    // 90 min ceiling — beyond this it's almost certainly forgotten

/**
 * Compute a doctor's current Average Consultation Time (ACT) in seconds.
 *
 * Steps:
 * 1. Fetch the N most recent completed visits for this doctor.
 * 2. Drop durations outside the absolute floor (2 min) and ceiling (90 min).
 * 3. Apply Tukey's fence (IQR method) to remove remaining statistical outliers.
 *    Lower fence = Q1 - 1.5×IQR, upper fence = Q3 + 1.5×IQR.
 *    This is symmetric, handles skewed distributions, and is the standard
 *    medical/clinical statistics approach.
 * 4. Average the cleaned set.
 * 5. Compare against the doctor's configured seed (seedActMinutes × 60):
 *    — If the calculated average differs by ≤ 30% from the seed, the seed is
 *      still a valid estimate (small sample, noisy data) → return seed.
 *    — If it differs by > 30%, the real consulting pattern has been established
 *      and deviates meaningfully from the estimate → return calculated.
 *    — If there isn't enough data after filtering (< 3 samples), return seed.
 *
 * This avoids thrashing the ETA calculation with early noise while still
 * adapting to the doctor's true pace once a pattern is established.
 */
export async function computeACT(doctorId) {
  const visitsRef = collection(db, "visits");

  // Fetch the doctor's configured seed time in parallel with the visits query
  let seedSeconds = DEFAULT_ACT_SECONDS;
  try {
    const doctorSnap = await getDoc(doc(db, "doctors", doctorId));
    if (doctorSnap.exists() && doctorSnap.data().seedActMinutes) {
      seedSeconds = doctorSnap.data().seedActMinutes * 60;
    }
  } catch (e) { /* fall through to DEFAULT_ACT_SECONDS */ }

  let snap;
  try {
    const q = query(
      visitsRef,
      where("doctorId", "==", doctorId),
      where("status", "==", "completed"),
      orderBy("consultEndAt", "desc")
    );
    snap = await getDocs(q);
  } catch (err) {
    console.error(`computeACT: query failed for doctor ${doctorId} — likely a missing Firestore index. Check the browser console for a link to create it.`, err);
    return seedSeconds;
  }

  // Step 1 — collect raw durations
  const rawDurations = [];
  snap.forEach((d) => {
    const v = d.data();
    if (v.consultStartAt && v.consultEndAt) {
      const start = v.consultStartAt.toMillis ? v.consultStartAt.toMillis() : new Date(v.consultStartAt).getTime();
      const end   = v.consultEndAt.toMillis   ? v.consultEndAt.toMillis()   : new Date(v.consultEndAt).getTime();
      const secs  = (end - start) / 1000;
      if (secs >= ACT_MIN_SECONDS && secs <= ACT_MAX_SECONDS) rawDurations.push(secs);
    }
  });

  // Step 2 — use only the N most recent after absolute bounds filtering
  const recent = rawDurations.slice(0, ACT_WINDOW_N);
  if (recent.length < 3) return seedSeconds; // too few data points — seed is more reliable

  // Step 3 — Tukey's IQR fence to remove statistical outliers
  const sorted = [...recent].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const cleaned = sorted.filter((s) => s >= lowerFence && s <= upperFence);

  if (cleaned.length < 3) return seedSeconds; // outlier removal left too few samples

  // Step 4 — mean of cleaned set
  const calculatedAvg = Math.round(cleaned.reduce((a, b) => a + b, 0) / cleaned.length);

  // Step 5 — compare against seed: if within ±30%, the seed is good enough
  const deviation = Math.abs(calculatedAvg - seedSeconds) / seedSeconds;
  if (deviation <= 0.30) {
    // Calculated ACT is close to the configured estimate — seed is still valid.
    // Using seed avoids ETA jitter from small-sample variation.
    return seedSeconds;
  }

  // Calculated ACT differs meaningfully from the seed — the doctor's real pace
  // has been established; use the data-driven value.
  return calculatedAvg;
}

/**
 * Recalculate ETA for every Waiting token in a doctor's active queue.
 * Call this after: cancel, no-show, complete, doctor break start/end, manual reorder.
 * tokens param: array of {id, tokenNumber, status, calledAt, consultStartAt, slotTime} sorted by queue order.
 *
 * Fixed-slot tokens (slotTime set) act as a time anchor: the cursor jumps forward
 * to max(cursor, slotTime) before scheduling that token, so all tokens behind a
 * fixed slot are pushed to after it. This ensures the ETA of the last token in
 * the queue is always the correct lower-bound for new fixed-slot bookings.
 */
export function calculateETAs(tokens, actSeconds, doctorOnBreakUntil = null) {
  let cursor = Date.now();
  if (doctorOnBreakUntil && doctorOnBreakUntil > cursor) {
    cursor = doctorOnBreakUntil;
  }
  const etas = {};
  for (const t of tokens) {
    if (t.status === "in_consultation" && t.consultStartAt) {
      const startMs = t.consultStartAt.toMillis ? t.consultStartAt.toMillis() : t.consultStartAt;
      const elapsed = (Date.now() - startMs) / 1000;
      const remaining = Math.max(60, actSeconds - elapsed);
      cursor = Date.now() + remaining * 1000;
      etas[t.id] = cursor;
    } else if (t.status === "waiting" || t.status === "called") {
      // Fixed-slot: doctor won't start this patient before their booked slotTime
      if (t.slotTime) {
        const slotMs = new Date(t.slotTime).getTime();
        if (slotMs > cursor) cursor = slotMs;
      }
      etas[t.id] = cursor;
      cursor += actSeconds * 1000;
    }
  }
  return etas;
}

/**
 * Return the earliest ISO datetime at which a new fixed-slot token could be
 * booked for a doctor — accounts for all existing walk-in and fixed-slot tokens
 * already in the queue. Minimum 15 minutes from now; rounded up to 5 minutes.
 */
export function earliestAvailableSlot(tokens, actSeconds, doctorOnBreakUntil = null) {
  const etas = calculateETAs(tokens, actSeconds, doctorOnBreakUntil);
  const etaValues = Object.values(etas);
  const lastEta = etaValues.length > 0 ? Math.max(...etaValues) : Date.now();
  const earliest = Math.max(lastEta + actSeconds * 1000, Date.now() + 15 * 60 * 1000);
  const fiveMin = 5 * 60 * 1000;
  return new Date(Math.ceil(earliest / fiveMin) * fiveMin).toISOString();
}

export function formatETA(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Format any date value (ISO string, YYYY-MM-DD, or Date) as dd-mmm-yyyy.
 * e.g. "2026-06-15" → "15-Jun-2026", "2026-01-01T00:00:00Z" → "01-Jan-2026"
 * Returns "—" for null/undefined/invalid input.
 */
export function fmtDate(val) {
  if (!val) return "—";
  // YYYY-MM-DD plain date strings (no time component) must be parsed as local midnight,
  // not UTC midnight, otherwise the displayed date can shift by one day in timezones east of UTC.
  const d = (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val))
    ? new Date(val + "T00:00:00")
    : new Date(val);
  if (isNaN(d)) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString([], { month: "short" }); // "Jan", "Feb", …
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m`;
}

/** Subscribe to all active (non-terminal) visits for one or all doctors. */
export function subscribeActiveQueue(doctorId, callback) {
  const visitsRef = collection(db, "visits");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let q;
  if (doctorId) {
    q = query(
      visitsRef,
      where("visitDate", "==", todayKey()),
      orderBy("tokenNumber", "asc")
    );
  } else {
    q = query(visitsRef, where("visitDate", "==", todayKey()), orderBy("tokenNumber", "asc"));
  }
  return onSnapshot(q, (snap) => {
    const all = [];
    snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
    const filtered = doctorId
      ? all.filter((v) => v.doctorId === doctorId || (v.preferredDoctorIds || []).includes(doctorId))
      : all;
    callback(filtered);
  });
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const DEFAULT_CLINIC_NAME = "Clinic Queue";

/**
 * Fetches the configured clinic name from Firestore (clinicSettings/main) and
 * applies it to every element with data-clinic-name on the page, plus swaps
 * it into document.title in place of the placeholder "Clinic Queue" text.
 * Falls back to DEFAULT_CLINIC_NAME if nothing has been configured yet.
 */
export async function applyClinicBranding() {
  let name = DEFAULT_CLINIC_NAME;
  try {
    const snap = await getDoc(doc(db, "clinicSettings", "main"));
    if (snap.exists() && snap.data().name) name = snap.data().name;
  } catch (err) {
    console.error("Could not load clinic name, using default.", err);
  }
  document.querySelectorAll("[data-clinic-name]").forEach((el) => {
    const suffix = el.dataset.clinicNameSuffix || "";
    el.textContent = name + suffix;
  });
  if (document.title.includes(DEFAULT_CLINIC_NAME)) {
    document.title = document.title.replace(DEFAULT_CLINIC_NAME, name);
  }
  return name;
}

export const STATUS_LABELS = {
  waiting: "Waiting",
  called: "Called",
  in_consultation: "In Consultation",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-Show",
};
