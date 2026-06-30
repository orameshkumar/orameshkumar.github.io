// Core business logic: ACT (average consultation time) and ETA calculation,
// shared by Reception, Doctor, and Queue Board views.
import {
  db, collection, query, where, orderBy, getDocs, doc, updateDoc, onSnapshot, runTransaction
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

/**
 * Compute a doctor's current Average Consultation Time (ACT) in seconds,
 * using the rolling average of their most recent N completed visits,
 * excluding outliers beyond 3x the median (simple guard against skew).
 */
export async function computeACT(doctorId) {
  const visitsRef = collection(db, "visits");
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
    // Most commonly: Firestore needs a composite index for this combination of
    // where()+orderBy() clauses on a brand-new project. Firestore's error message
    // in the browser console includes a direct link to auto-create the index —
    // open that link, click "Create index", wait a minute, and this will resolve itself.
    console.error(`computeACT: query failed for doctor ${doctorId} — likely a missing Firestore index. Check the browser console for a link to create it.`, err);
    return DEFAULT_ACT_SECONDS;
  }
  const durations = [];
  snap.forEach((d) => {
    const v = d.data();
    if (v.consultStartAt && v.consultEndAt) {
      const start = v.consultStartAt.toMillis ? v.consultStartAt.toMillis() : v.consultStartAt;
      const end = v.consultEndAt.toMillis ? v.consultEndAt.toMillis() : v.consultEndAt;
      const secs = (end - start) / 1000;
      if (secs > 0 && secs < 3 * 60 * 60) durations.push(secs); // sanity cap: <3hrs
    }
  });
  const recent = durations.slice(0, ACT_WINDOW_N);
  if (recent.length === 0) return DEFAULT_ACT_SECONDS;

  const sorted = [...recent].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const filtered = recent.filter((s) => s <= median * 3);
  const useSet = filtered.length > 0 ? filtered : recent;
  const avg = useSet.reduce((a, b) => a + b, 0) / useSet.length;
  return Math.round(avg);
}

/**
 * Recalculate ETA for every Waiting token in a doctor's active queue.
 * Call this after: cancel, no-show, complete, doctor break start/end, manual reorder.
 * tokens param: array of {id, tokenNumber, status, calledAt, consultStartAt} sorted by queue order.
 */
export function calculateETAs(tokens, actSeconds, doctorOnBreakUntil = null) {
  let cursor = Date.now();
  if (doctorOnBreakUntil && doctorOnBreakUntil > cursor) {
    cursor = doctorOnBreakUntil;
  }
  const etas = {};
  for (const t of tokens) {
    if (t.status === "in_consultation" && t.consultStartAt) {
      // Elapsed time already spent; remaining estimate floors at 1 minute.
      const startMs = t.consultStartAt.toMillis ? t.consultStartAt.toMillis() : t.consultStartAt;
      const elapsed = (Date.now() - startMs) / 1000;
      const remaining = Math.max(60, actSeconds - elapsed);
      cursor = Date.now() + remaining * 1000;
      etas[t.id] = cursor;
    } else if (t.status === "waiting" || t.status === "called") {
      etas[t.id] = cursor;
      cursor += actSeconds * 1000;
    }
  }
  return etas;
}

export function formatETA(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

export const STATUS_LABELS = {
  waiting: "Waiting",
  called: "Called",
  in_consultation: "In Consultation",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-Show",
};
