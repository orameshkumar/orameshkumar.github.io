# ABC Store - User Guide

## Overview

ABC Store is a Progressive Web App (PWA) for billing and inventory management at a provisional/grocery store. It works completely offline on your mobile phone or desktop browser.

---

## Installation

### On Mobile (Android/iOS)

1. Open the app URL in Chrome (Android) or Safari (iOS)
2. You'll see a prompt "Add to Home Screen" — tap it
3. The app icon appears on your home screen like a native app
4. Works offline after first load

### On Desktop

1. Open the app URL in Chrome/Edge
2. Click the install icon (⊕) in the address bar
3. Click "Install"

---

## Screens

### 1. Items (Item Master)

This is where you manage your product catalog.

**Adding an Item:**
1. Tap the **+** button (bottom-right)
2. Fill in:
   - **Item Name** (required) — e.g., "Rice", "Dal", "Sugar"
   - **Base Price per KG** (required) — the selling price for 1 kilogram
   - **Voice Tag** — a word you'll use when speaking to add this item during billing (e.g., "arisi", "chawal")
   - **Image** — tap 📸 to capture a photo with your phone camera
3. Tap **Save**

**Editing an Item:**
- Tap the ✏️ button on any item card
- Modify fields and tap Save

**Deleting an Item:**
- Tap the 🗑️ button on any item card
- Confirm deletion

**Searching:**
- Use the search bar at the top to filter items by name

---

### 2. Billing

This is where you create bills for customers.

**Layout (top to bottom):**
- **Current Bill** — shows items added to the current bill with running total
- **Item Selector** — search and tap items to select
- **Quick Entry Buttons** — preset quantities (50g, 100g, 250g, 500g, 750g, 1KG)
- **Custom Quantity** — type any gram value
- **Voice Button** 🎤 — hands-free billing

**How to Bill:**

1. **Select a quantity** — tap a quick button (e.g., "500g") or type a custom amount
2. **Select an item** — tap an item card from the grid
3. The item is automatically added to the Current Bill with calculated price
4. **Quantity stays selected** — tap another item to add it at the same quantity
5. Repeat for all items

**Editing a Bill Line:**
- Tap the **quantity** (blue badge) to change grams
- Tap the **price** to override with a custom amount (shows in red when overridden)
- Tap ❌ to delete a line item

**Finalizing:**
1. Review the Current Bill and total
2. Tap **Finalize Bill**
3. A bill number is generated (format: ABC-YYYYMMDD-NNN)
4. If UPI is configured, a QR code appears for payment
5. Bill is saved to history

---

### 3. Voice Billing

Tap the 🎤 microphone button to start voice mode (turns red with animation).

**How it works:**
- Speak item names and quantities in a single command
- Example: *"rice half kg dal 100 gram sugar 250 gram"*
- The engine matches your words against item names and voice tags
- Items are automatically added to the bill

**Supported quantity phrases:**

| Say this | Adds |
|----------|------|
| "half kg" or "half" | 500g |
| "quarter" or "quarter kg" | 250g |
| "one kg" or "1 kg" | 1000g |
| "100 gram" | 100g |
| "two fifty gram" | 250g |
| "seven fifty" | 750g |
| "three quarter" | 750g |

**Tips:**
- Set short, unique voice tags for each item (e.g., "rice", "dal", "oil")
- Speak clearly with pauses between items
- The app shows "Heard: ..." notification so you can see what was recognized
- If something isn't recognized, it shows a notification — add it manually

**Fuzzy Matching:**
- Misheard words are matched approximately (e.g., "ric" matches "rice")
- Misspelled units are normalized (e.g., "graam", "grm" → "gram")

---

### 4. History

View all past bills.

**Features:**
- Bills listed in ascending order by bill number
- Tap a bill card to expand and see line items
- **Filter** by date range using From/To fields
- **Share via WhatsApp** — tap the green button to send bill to customer
- If WhatsApp isn't available, bill text is copied to clipboard

---

### 5. Reports

View sales summaries.

**Three views:**
- **Total** — overall sales for selected date range
- **Day-wise** — daily breakdown with totals per day
- **Item-wise** — how much of each item was sold (quantity and revenue)

**How to use:**
1. Select a date range (From/To)
2. Tap **Generate**
3. Switch between Total / Day-wise / Item-wise tabs

---

### 6. Settings

Configure your store.

**Store Name:**
- Displayed in the header banner, WhatsApp bills, and QR payment modal
- Default: "ABC Store"
- Change it to your actual store name

**UPI Payment:**
- **UPI ID** — your payment address (e.g., `yourstore@upi`)
- **Payee Name** — name shown to customer during payment
- **Merchant Code** — optional, for business accounts

When UPI is configured, a QR code is shown after each bill finalization. Customers scan it with GPay/PhonePe/Paytm to pay the exact bill amount. The bill number is included in the payment note.

---

## Tips & Tricks

- **Clear cache to see updates:** If the app doesn't show latest changes, go to browser Settings → Site Settings → Clear Data, or use DevTools → Application → Clear site data
- **Works offline:** All data is stored on your device. No internet needed after first load
- **Backup:** Data is stored in browser. Clearing browser data will delete all items and bills
- **Multiple tabs:** Don't open the app in multiple tabs simultaneously — it may cause data conflicts
- **Best browser:** Chrome on Android, Safari on iOS

---

## Keyboard Shortcuts (Desktop)

- Use Tab to navigate between fields
- Enter to submit/save in modals
- Type in search boxes to quickly find items

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| App shows old version | Clear site data in browser settings |
| Voice not working | Allow microphone permission; use Chrome |
| Camera not opening | Allow camera permission; use HTTPS |
| QR code not scanning | Ensure UPI ID is correct; try zooming in |
| Items not appearing in billing | Refresh page; items need name + price to be valid |
| Bill number resets | Bill counter resets daily (001 each day) — this is by design |
