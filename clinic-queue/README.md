# Clinic Queue Manager — Prototype

A working prototype of the multi-doctor patient queue system: token issuance with multi-doctor preference, real-time ETA calculation, a public animated queue board, doctor consultation workflow with patient history, self-service QR booking, and per-visit billing.

This is a **functional proof-of-concept**, not a production-hardened system. See "Known limitations" before using it with real patients.

## What's included

| File | Purpose |
|---|---|
| `index.html` | Staff login (Reception / Doctor / Admin) |
| `admin.html` | Configure doctors, rooms, fees; link staff Firebase logins to roles |
| `reception.html` | Patient registration/search, token issuance (multi-doctor preference + over-capacity warning), vitals intake, billing |
| `doctor.html` | Doctor's live queue, call/start/complete consultation, patient history lookup by Patient ID, break control |
| `board.html` | Public, no-login, animated visual queue board for a waiting-room TV |
| `self-service.html` | Patient-facing booking form opened by scanning the QR shown on the board |
| `patients.html` | Browsable, searchable directory of every registered patient with full details and visit history; supports editing and deleting patient records |
| `billing.html` | Fee/collection report with date-range, doctor, and patient filters — accessible to Reception, Doctor, and Admin |
| `patient-card.html` | Printable patient card with QR code, opened from Reception or Patients |
| `js/qrcode-lib.js` | Self-contained, verified-correct QR code encoder (no CDN dependency) |
| `js/barcode-scanner.js` | Camera barcode/QR scanning via the browser's native BarcodeDetector API |
| `js/firebase-config.js` | Firebase connection (already configured with your project keys) |
| `js/queue-logic.js` | ACT (average consultation time), ETA calculation, and Patient ID generation — shared by all pages |

## One-time setup

### 1. Lock down Firestore security rules
Your database is currently in **Test mode** (open read/write to anyone, expires in 30 days). Before relying on this beyond your own testing, go to **Firestore Database → Rules** and replace with something like:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function myRole() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role; }

    match /doctors/{doc} { allow read: if true; allow write: if isSignedIn() && myRole() in ['admin','doctor']; }
    match /patients/{doc} { allow read, create: if true; allow update, delete: if isSignedIn(); }
    match /visits/{doc} { allow read, create: if true; allow update: if isSignedIn() || true; }
    match /users/{doc} { allow read: if isSignedIn(); allow write: if isSignedIn() && myRole() == 'admin'; }
    match /clinicSettings/{doc} { allow read: if true; allow write: if isSignedIn() && myRole() == 'admin'; }
  }
}
```
This is still permissive (it allows the public board/self-service pages to read/write without login, which the design requires) — a real deployment should tighten this further with field-level validation and rate limiting. Treat this as a starting point, not a final answer.

### 2. Create your first Admin login
In Firebase Console → Authentication → Users, add a user (e.g. `admin@clinic.local`). Copy their **User UID**. Since `admin.html` itself requires being signed in to reach it, manually create the first mapping document directly in Firestore Console:
- Go to Firestore → Data → start collection `users`
- Document ID: paste the UID you copied
- Fields: `role` (string) = `admin`, `displayName` (string) = whatever you like

Now sign in at `index.html` with that account and you'll land on Admin Setup.

### 3. Add doctors and staff
- In `admin.html`, add each doctor (name, fee, seed average consult time, room).
- In Firebase Authentication, create a login for each doctor and for Reception staff.
- Back in `admin.html`, paste each new user's UID and link it to the right role (and doctor, if applicable).

## Running locally
Because this uses ES modules (`type="module"`), opening the HTML files directly via `file://` will be blocked by the browser. Serve the folder locally instead:

```bash
cd clinic-queue
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploying to GitHub Pages
1. Push this folder to a GitHub repository.
2. Repo → Settings → Pages → Source: deploy from the branch containing this folder (root, or `/docs` if you move it there).
3. Your app will be live at `https://<username>.github.io/<repo>/`.
4. Bookmark `board.html` on the waiting-room TV, `reception.html` on the front-desk device, and have each doctor bookmark `doctor.html` on their tablet/phone.

## Printable patient card with QR code

From the Patients directory ("View" → "Print patient card") or Reception (after loading an existing patient, "Print patient card"), staff can open a printable card showing the patient's name, age/gender, mobile, and a QR code encoding their Patient ID. It opens in a new tab/window with a Print button; use your browser/OS print dialog to print to a label printer or regular paper.

The QR encoding is handled by a vendored, locally-written encoder (`js/qrcode-lib.js`) rather than a CDN-hosted library — this was deliberate after repeated problems with third-party QR libraries failing in ways that were hard to diagnose (see git history / chat log if curious). It has been verified by actually rendering and decoding test output with a real barcode scanner, across multiple QR versions and edge cases (short strings, long URLs, special characters) — not just visually inspected.

**Important**: patients registered before the Patient ID feature was added won't have a `patientCode`, so their printed card will show "No ID on record" instead of a QR code until/unless they're re-saved with a generated ID (not currently automated).

## Camera barcode scanning

A small camera icon next to the search boxes on Reception, Patients, and the Doctor lookup field opens a live camera scanner (using the browser's native `BarcodeDetector` API — no external decoding library). Point the camera at a printed patient card's QR code and the search box fills automatically.

**Browser support**: works on Chrome/Edge on Android and desktop. **Does not currently work on Safari/iOS**, which hasn't implemented `BarcodeDetector` as of this writing — those users will see a clear message and can still type the Patient ID manually. Worth checking current Safari support before relying on this for an iPhone-heavy reception desk.

## Reordering the queue (move to end)

On Reception's "Today's tokens" table, each Waiting token now has a "Move to end" button alongside Cancel. This moves the patient behind everyone currently waiting for that same doctor — useful if a patient steps away or needs to be deprioritized — without changing their token number (the one printed on their slip and shown everywhere else stays exactly the same; only their position in line changes).

Under the hood this uses a separate `queueSequence` field (distinct from the permanent `tokenNumber`) that the Doctor view and Queue Board now sort by instead of `tokenNumber` directly. New tokens get `queueSequence` set equal to their `tokenNumber` at issuance, so normal queue order is unaffected unless someone is explicitly moved.

## Editing and deleting patients

Reception (in the registration form, after searching for an existing patient) and the Patients directory (`patients.html`, via "View" → "Edit details") both support editing a patient's name, mobile, age, gender, and address — these now correctly save (a prior version silently discarded edits made through Reception when a token was issued in the same action; that's fixed).

Deleting a patient asks which kind every time:
- **Soft delete ("hide")**: removes them from search/listings but keeps all visit and billing history fully intact. Reversible by an admin directly in Firestore (clear the `deletedAt` field on that patient document) — there's no UI for restoring yet.
- **Hard delete ("delete")**: permanently removes the patient record. Their past visits and bills remain in reports (so financial history isn't lost) but are no longer linked to a live patient profile. This cannot be undone from the UI.

## Billing report (`billing.html`)

Reception, Doctor, and Admin roles can all see what's been collected — today, yesterday, the last 7 days, this month, or any custom date range — with optional filters by doctor and by patient (name, mobile, or Patient ID). Shows total/consultation/other-fee summaries, a by-doctor breakdown, a by-payment-mode breakdown, and an itemized transaction table with receipt numbers.

## Self-service QR code

The QR code on the Queue Board (`board.html`) is generated **live in the browser**, using our own verified-correct QR encoder (`js/qrcode-lib.js` — see "Printable patient card" below for how that was verified). This replaced an earlier static-image approach that required manually regenerating an SVG file any time the deployed URL changed.

The URL it encodes is resolved in this order:
1. An explicit `selfServiceUrl` set in Admin Setup → "Clinic branding" (recommended if you have a custom domain, or want certainty regardless of how the board's browser tab was opened).
2. If nothing is configured, it falls back to the Queue Board's own current page location with `self-service.html` substituted in — which works correctly out of the box for the overwhelming majority of single-deployment setups, since both pages normally live in the same folder.

This means: if you ever move to a new GitHub Pages URL, a custom domain, or a different host entirely, the QR code on the board self-corrects automatically — no asset to regenerate, unless you've explicitly pinned a URL in Admin Setup, in which case update it there.

The `assets/self-service-qr.svg` file from an earlier version is no longer used by any page but is harmless to leave in the repo if you don't want to bother deleting it.

## Clinic branding

The clinic's name shown in the banner across every page (and in the browser tab title) is configurable from Admin Setup → "Clinic branding" — no need to edit any code. It's stored in a `clinicSettings/main` Firestore document and falls back to the placeholder "Clinic Queue" until an admin sets a real name. The Queue Board and self-service booking page (both public, no login) read it too, so update it once and it shows everywhere on next page load.

The same Admin Setup card also lets you optionally pin an explicit self-service booking URL (`selfServiceUrl` on the same document), used to generate the Queue Board's QR code — see "Self-service QR code" above for when you'd actually want to set this versus leaving it blank.

## Patient IDs

Every newly registered patient (via Reception or self-service booking) now gets a sequential, human-readable Patient ID like `CLN-000001`, generated through a Firestore transaction against a `counters/patientId` document so two simultaneous registrations never collide on the same number. This ID is what gets shown to staff, searched on, and is intended to go on a printed token slip/patient card once barcode printing is wired up (see limitations below).

Patients registered before this feature was added won't have a `patientCode` — they'll show as "—" in the directory and lookup screens until/unless you backfill them (not currently automated).

## Login sessions are per-tab, not per-browser

Each browser tab holds its own independent login. This is deliberate: if two doctors share one physical machine, each can open their own tab and sign in as themselves without affecting the other's tab or any other open tab/window.

The tradeoff: a session does not survive closing the tab, and does not survive being shared with a new tab — each new tab starts logged out and needs sign-in again. A refresh **within the same tab** keeps you logged in. This matches doctors typically opening one fresh tab per shift rather than expecting to stay logged in across browser restarts.

## Known limitations (read before relying on this)

- **No offline mode.** Every screen needs a live connection to Firestore. If the clinic's network drops, Reception/Doctor/Board all stop updating.
- **Calendar/availability is simplified.** The full weekly-template/leave/break calendar from the requirements document isn't built yet — only ad-hoc breaks (FR-2.3) are implemented. The over-capacity warning currently uses a fixed 120-minute proxy rather than checking real calendar windows.
- **No real barcode scanning.** "Scan" on the Doctor page and the board's QR are both placeholders — wiring up a camera-based barcode/QR scanner (e.g. via a library like `jsQR`) is a follow-up step, not yet done.
- **No WhatsApp integration yet.** Notifications (FR-10.x) require a Business API provider account and server-side message sending — not something a static GitHub Pages site can do directly; needs a small serverless function (e.g. Firebase Cloud Functions) to call the WhatsApp API securely.
- **No receipt PDF/printing.** Billing produces an on-screen confirmation only; a printable receipt template isn't built yet.
- **Security rules are permissive for now** (see step 1 above) — fine for piloting with trusted staff, not yet appropriate for handling real patient data at scale.
- **Per-patient barcode generation/printing isn't implemented** — Patient IDs exist in the data, but generating/printing an actual barcode label needs a barcode-rendering library and a connected label printer, which is hardware-dependent and best wired up once you've chosen a printer.
- **Single clinic/branch only** — the data model from the BRD anticipates multi-branch, but this build assumes one clinic.

## Suggested next steps, roughly in priority order
1. Test the full flow yourself: add a doctor in Admin, issue a token in Reception, call/complete it in Doctor, collect a fee, watch it all reflect on the Board.
2. Tighten Firestore security rules once you're past pure testing.
3. Wire up a real barcode scanner library on the Doctor page.
4. Build the full calendar (weekly templates + leave) — currently the most simplified part of the prototype relative to the requirements document.
5. Add WhatsApp via a Cloud Function once you're ready to handle that integration.
