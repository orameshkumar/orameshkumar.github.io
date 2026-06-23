# ABC Debt Collection - User Guide

## Overview

ABC Debt Collection is an offline-capable Progressive Web App (PWA) for managing daily debt collection operations. It allows you to register clients, track daily EMI payments via UPI QR code, and view collection reports — all stored locally on your device with no internet required.

---

## Getting Started

### Installation

1. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari)
2. On mobile: tap the browser menu and select **"Add to Home Screen"** or **"Install App"**
3. The app will install as a standalone application on your device
4. Once installed, it works fully offline

### First-Time Setup

Before collecting payments, configure your settings:

1. Tap the **⚙️ Settings** tab at the bottom
2. Enter your **Application Name** (default: "ABC Debt Collection") — this appears in headers and QR codes
3. Enter your **UPI ID** (e.g., `yourname@upi`) — required for generating payment QR codes
4. Tap **Save Settings**
5. Optionally toggle **Dark Theme** for low-light usage

---

## Screens

### 1. Clients (👥)

The Client Master screen manages all your borrower records.

**Adding a Client:**
1. Tap the **+** button (bottom-right corner)
2. Fill in the required fields:
   - **Client Name** — unique name (max 100 characters)
   - **Mobile Number** — exactly 10 digits
   - **Total Borrowed Amount** — the full debt amount
   - **Collection Start Date** — when collection begins
3. Optional fields auto-calculate:
   - **Duration** — defaults to 100 days
   - **EMI** — auto-calculated as Amount ÷ Duration (editable)
   - **End Date** — auto-calculated as Start Date + Duration
4. Tap **Save Client**

**Editing a Client:**
- Tap the ✏️ button on any client card
- Modify fields and tap **Save Client**

**Deleting a Client:**
- Tap the 🗑️ button on any client card
- Confirm the deletion (this also removes all payment records for that client)

**Searching:**
- Use the search bar at the top to filter clients by name in real-time

---

### 2. Collection (💰)

The Daily Collection screen is your primary working screen for recording payments.

**Daily Workflow:**
1. The date defaults to today — change it if recording for a different date
2. The list shows all clients with pending balances (alphabetically sorted)
3. For each client, you see:
   - Client name
   - Pending amount (total borrowed minus all payments made)
   - EMI amount (editable — adjust before collecting)
4. Tap **Collect** to initiate payment

**Payment Flow:**
1. A QR code page opens with the UPI payment link
2. The client scans the QR code with their UPI app
3. Adjust the amount if needed
4. Tap **Confirm Payment** to record the collection
5. The client's row turns green with a "✓ Paid today" badge

**Filters:**
- **Search** — type a client name to filter the list
- **Not paid today** checkbox — when checked, hides clients who already paid today (useful to see remaining collections)

---

### 3. History (📋)

View all recorded payments filtered by date range.

**Usage:**
1. Set the **From** and **To** dates (defaults: last 30 days)
2. Payments display in a single-line format: Date | Client Name | Amount
3. Tap the 🗑️ button on any record to delete it (with confirmation)

---

### 4. Reports (📊)

View aggregated collection data with two report types.

**Day-wise Report:**
- Shows total amount collected per day
- Sorted by most recent date first
- Includes a grand total at the bottom

**Client-wise Report:**
- Shows total amount collected per client
- Sorted alphabetically by client name
- Includes a grand total at the bottom

**Date Range:**
- Defaults to the current month (1st to today)
- Adjust the From/To dates to view any period

**Print:**
- Tap **🖨️ Print Report** to print the currently visible report
- The printed output shows only the app name, date range, and report table (no navigation or buttons)

---

### 5. Settings (⚙️)

Configure app-wide settings.

| Setting | Description |
|---------|-------------|
| **Dark Theme** | Toggle between light and dark appearance |
| **Application Name** | Displayed in headers, QR codes, and print reports (max 50 chars) |
| **UPI ID** | Your payment address for receiving collections (format: `name@provider`, max 45 chars) |

---

## QR Code Payments

The app generates UPI QR codes using the format:
```
upi://pay?pa=<UPI_ID>&pn=<App_Name>&am=<Amount>&cu=INR&tn=<Client_Name>
```

- The client scans this with any UPI app (Google Pay, PhonePe, Paytm, etc.)
- If QR generation fails, a tappable UPI link is shown as fallback
- **UPI ID must be configured in Settings** before collecting payments

---

## Data Storage

- All data is stored **locally on your device** using IndexedDB
- No data is sent to any server
- Data persists across browser sessions and device restarts
- The app works fully offline after first load
- **Back up your device regularly** — clearing browser data will remove all records

---

## Tips

- **Install as PWA** for the best mobile experience (full screen, no browser UI)
- Use the **"Not paid today"** filter in Collection to quickly see who hasn't paid yet
- **Edit EMI** before collecting if a client wants to pay a different amount
- **Dark theme** reduces eye strain for evening collections
- The **search bar** works instantly — no need to press Enter
- **Print reports** for paper records or sharing with clients

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| QR code not showing | Check that UPI ID is configured in Settings |
| App not installing | Use Chrome or Edge on Android; Safari on iOS |
| Data lost after update | Service worker may have cleared cache — data in IndexedDB should persist |
| Storage full error | Delete old client records or clear other browser data |
| Dark theme colors wrong | Refresh the page after switching themes |

---

## Technical Details

- **Technology:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Storage:** IndexedDB for clients/payments, localStorage for settings
- **QR Library:** qrcode-generator by Kazuhiko Arase
- **Offline:** Service Worker with cache-first strategy
- **Compatible:** Chrome 60+, Firefox 60+, Safari 12+, Edge 79+
