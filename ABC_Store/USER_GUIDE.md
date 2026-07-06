# ABC_Store - User Guide

## Overview

ABC_Store is a Progressive Web App (PWA) for billing and inventory management at a provisional/grocery store. It works completely offline on your mobile phone or desktop browser.

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
   - **Base Unit** — select one:
     - **Kilogram (KG)** — for items sold by weight
     - **Litre (L)** — for items sold by volume (oil, milk)
     - **Count (Nos)** — for items sold by number (eggs, packets)
   - **Base Price** (required) — the selling price per KG / per Litre / per Unit depending on base unit
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
- **Quick Entry Buttons** — preset quantities that change based on item type:
  - KG items: 50g, 100g, 250g, 500g, 750g, 1KG
  - Litre items: 50ml, 100ml, 250ml, 500ml, 750ml, 1L
  - Count items: 1, 2, 3, 5, 6, 10, 12
- **Custom Quantity** — type any value
- **Voice Button** 🎤 — hands-free billing
- **Scan Barcode** 📷 — camera-based barcode entry

**How to Bill (Touch):**

1. **Select a quantity** — tap a quick button (e.g., "500g") or type a custom amount
2. **Select an item** — tap an item card from the grid
3. The item is automatically added to the Current Bill with calculated price
4. **Quantity stays selected** — tap another item to add it at the same quantity
5. Repeat for all items

**How to Bill (Barcode Scanner):**

1. Tap **📷 Scan Barcode** button
2. Point camera at an **item barcode** → notification shows "✓ Item Name — scan quantity"
3. Point camera at a **quantity barcode** → item is added to bill
4. Repeat: item → quantity → item → quantity...
5. If multiple barcodes are visible, the one closest to camera center is selected

**Editing a Bill Line:**
- Tap the **quantity** (blue badge) to change the amount
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
- The engine matches your words against item names AND voice tags
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
- Misheard item names are matched approximately (e.g., "ric" matches "rice", "dall" matches "dal")
- Misspelled units are normalized (e.g., "graam", "grm", "ggram" → "gram"; "kgs", "keji" → "kg")

---

### 4. Barcode Billing

Use printed barcodes for fast data entry without touching the screen.

**Setup (one-time):**
1. Go to **Settings** → tap **"Print Item Barcodes"**
2. Select the items you want barcodes for (Select All / Deselect All available)
3. A printable page opens — shows item name (large, uppercase) + barcode
4. Print and laminate the sheet, keep at counter
5. Similarly, tap **"Print Quantity Barcodes"** to print quantity sheets (KG, Litre, Count)

**During billing:**
1. Tap **📷 Scan Barcode** in the billing screen
2. Camera opens with a red guide line in the center
3. Point at an **item barcode** → phone vibrates, shows "✓ Rice — scan quantity"
4. Point at a **quantity barcode** (e.g., 500g) → phone vibrates, item added to bill
5. Continue scanning: item → quantity → item → quantity...

**Multiple barcodes visible?**
The scanner picks the barcode closest to the center of the camera frame (where the red line is).

---

### 5. History

View all past bills.

**Features:**
- Bills listed in ascending order by bill number
- Tap a bill card to expand and see line items
- **Filter** by date range using From/To fields
- **Share via WhatsApp** — tap the green button to send bill to customer
- If WhatsApp isn't available, bill text is copied to clipboard

---

### 6. Reports

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

### 7. Settings

Configure your store.

**Store Name:**
- Displayed in the header banner, WhatsApp bills, QR payment modal, and barcode reports
- Default: "ABC Store"
- Change it to your actual store name

**UPI Payment:**
- **UPI ID** — your payment address (e.g., `yourstore@upi`)
- **Payee Name** — name shown to customer during payment
- **Merchant Code** — optional, for business accounts

When UPI is configured, a QR code is shown after each bill finalization. Customers scan it with GPay/PhonePe/Paytm to pay the exact bill amount. The bill number is included in the payment note.

**Barcode Reports:**
- **Print Item Barcodes** — select items, generate printable barcode sheet
- **Print Quantity Barcodes** — generate quantity barcode sheets for all unit types

---

## Base Units Explained

| Unit | Price set as | Quick buttons | Example |
|------|-------------|---------------|---------|
| **KG** | ₹ per Kilogram | 50g, 100g, 250g, 500g, 750g, 1KG | Rice ₹80/KG → 500g = ₹40 |
| **Litre** | ₹ per Litre | 50ml, 100ml, 250ml, 500ml, 750ml, 1L | Oil ₹180/L → 500ml = ₹90 |
| **Count** | ₹ per Unit | 1, 2, 3, 5, 6, 10, 12 | Eggs ₹7/Nos → 6 = ₹42 |

---

## Tips & Tricks

- **Clear cache to see updates:** If the app doesn't show latest changes, clear site data in browser settings, or use DevTools → Application → Clear site data
- **Works offline:** All data is stored on your device. No internet needed after first load
- **Backup:** Data is stored in browser. Clearing browser data will delete all items and bills
- **Multiple tabs:** Don't open the app in multiple tabs simultaneously
- **Best browser:** Chrome on Android (supports barcode scanning + voice + camera)
- **Barcode tips:** Print barcodes on A4 paper, laminate for durability. Keep item sheet on wall and quantity sheet at billing counter

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| App shows old version | Clear site data in browser settings, reload |
| Voice not working | Allow microphone permission; use Chrome |
| Camera not opening | Allow camera permission; use HTTPS |
| Barcode scanner not available | Use Chrome 83+ on Android; not supported on iOS Safari |
| QR code not scanning | Ensure UPI ID is correct; try zooming in |
| Items not appearing in billing | Refresh page; items need name + price to be valid |
| Bill number resets | Bill counter resets daily (001 each day) — by design |
| Quick buttons don't match item | Select the item first — buttons switch to match unit type |
| Barcode printed but won't scan | Ensure print quality is good; hold phone steady |

---

## Hardware Integration

ABC Store supports digital weighing machines and thermal printers via the Web Serial API. This enables automatic weight capture during billing and direct receipt printing.

### Supported Weighing Scales

| Model | Interface | Default Baud Rate | Data Format |
|-------|-----------|-------------------|-------------|
| Essae DS-252 | USB-to-Serial | 9600 | 8N1 |
| Phoenix PCS-10 | USB-to-Serial | 9600 | 8N1 |
| TVS Achiever | USB-to-Serial | 9600 | 8N1 |
| Any RS-232 scale | USB-to-Serial adapter | Configurable | Configurable |

> **Note:** Most scales that output continuous ASCII weight readings (format: `+  1.250 kg`) are compatible.

### Supported Thermal Printers

| Model | Interface | Paper Width | Protocol |
|-------|-----------|-------------|----------|
| TVS RP 3160 | USB | 80mm | ESC/POS |
| Generic 58mm Thermal | USB | 58mm | ESC/POS |
| Generic 80mm Thermal | USB | 80mm | ESC/POS |
| Any ESC/POS Printer | USB-to-Serial | 58mm/80mm | ESC/POS |
| Any System Printer | USB/WiFi/Bluetooth | Any | Browser Print |

### Weighing Scale Setup

1. Connect scale to computer via USB cable (or USB-to-Serial adapter)
2. Open ABC Store in Chrome/Edge browser
3. Go to Settings → Weighing Scale section
4. Set baud rate to match your scale (default: 9600)
5. Set data bits (default: 8), stop bits (default: 1), parity (default: none)
6. Save settings
7. On Billing screen, tap the scale icon (⚖️) to connect
8. Chrome will show a port selection dialog — select your scale
9. Green dot indicates successful connection
10. Place item on scale — weight auto-fills when stable (±2g for 0.5 seconds)

### Thermal Printer Setup

**Browser Print mode:**

1. Connect printer to your computer
2. Set it as the default system printer
3. Go to Settings → Printer → Mode: "Browser Print"
4. Select paper width (58mm or 80mm)
5. After finalizing a bill, the browser print dialog will appear

**ESC/POS Direct mode:**

1. Connect USB thermal printer to your computer
2. Go to Settings → Printer → Mode: "ESC/POS (Direct)"
3. Select paper width
4. Tap "Connect Printer" and select the printer port
5. Bills will print silently without a dialog

### Hardware Troubleshooting

| Problem | Solution |
|---------|----------|
| Scale not detected | Ensure USB cable is connected. Try a different USB port. Check if another app is using the port. |
| Weight not reading | Verify baud rate matches scale settings. Common: 9600. Check data format (8N1). |
| Weight readings fluctuate | Normal — the app waits for stable readings (±2g for 0.5s). Keep items still. |
| Printer not printing (ESC/POS) | Check USB connection. Try reconnecting the printer port. Verify the printer is powered on. |
| Garbled printer output | Check paper width setting matches your printer (58mm vs 80mm). |
| "Not supported" message | Web Serial requires Chrome 89+ or Edge 89+. Firefox and Safari are not supported. |
| Scale icon shows red dot | Connection lost. Tap to reconnect. Check USB cable. |
| Connect button not visible | Your browser doesn't support Web Serial API. Use Chrome or Edge. |

### Browser Requirements

- **Supported**: Google Chrome 89+, Microsoft Edge 89+
- **Not Supported**: Firefox, Safari, Opera (Web Serial API not available)
- **Mobile**: Android Chrome supports Web Serial with OTG USB adapters
- **Note**: Manual weight entry and browser print work in all browsers
