# Design Document

## Overview

The ABC Provisional Store Billing PWA is a standalone, offline-first web application built with vanilla HTML, CSS, and JavaScript. It uses IndexedDB (via a lightweight wrapper) for structured data storage and the Web Speech API for voice-enabled billing. The app is structured as a single-page application (SPA) with tab-based navigation.

## Architecture

### Technology Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Storage**: IndexedDB for item master and bills; localStorage for app settings and counters
- **Voice**: Web Speech API (SpeechRecognition interface)
- **Camera**: MediaDevices API (getUserMedia) with HTML5 Canvas for image compression
- **PWA**: Service Worker + Web App Manifest
- **Build**: No build tools — plain files served statically

### Application Structure

```
provisional-store-billing-pwa/
├── index.html              # Single page shell with navigation
├── css/
│   └── styles.css          # All application styles
├── js/
│   ├── app.js              # App initialization, routing, service worker registration
│   ├── db.js               # IndexedDB wrapper (open, CRUD operations)
│   ├── item-master.js      # Item Master screen logic
│   ├── billing.js          # Billing entry screen logic
│   ├── voice-engine.js     # Voice recognition and command parsing
│   ├── bill-history.js     # History view logic
│   ├── reports.js          # Sales reports logic
│   └── utils.js            # Shared utilities (formatting, bill number generation)
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker for offline caching
└── icons/
    ├── icon-192.png        # PWA icon 192x192
    └── icon-512.png        # PWA icon 512x512
```

### Data Models

#### Item (IndexedDB: `items` store)

```javascript
{
  id: String,              // Auto-generated UUID
  name: String,            // Item display name
  basePricePerKg: Number,  // Price in currency per kilogram
  imageBase64: String,     // Compressed Base64 JPEG (nullable)
  voiceTag: String,        // Voice recognition keyword (nullable)
  createdAt: String,       // ISO timestamp
  updatedAt: String        // ISO timestamp
}
```

#### Bill (IndexedDB: `bills` store)

```javascript
{
  id: String,              // Auto-generated UUID
  billNumber: String,      // Format: ABC-YYYYMMDD-NNN
  date: String,            // ISO date string (YYYY-MM-DD)
  time: String,            // ISO time string (HH:MM:SS)
  lineItems: [
    {
      itemId: String,      // Reference to item
      itemName: String,    // Denormalized item name
      quantityGrams: Number, // Quantity in grams
      pricePerKg: Number,  // Base price at time of billing
      lineTotal: Number    // Calculated: pricePerKg * quantityGrams / 1000
    }
  ],
  total: Number,           // Sum of all lineTotal values
  createdAt: String        // ISO timestamp
}
```

#### App Settings (localStorage)

```javascript
{
  dailySequence: {
    date: "YYYY-MM-DD",    // Current date
    counter: Number        // Next sequence number
  }
}
```

## Screen Designs

### Screen 1: Item Master

- **Layout**: List of items with thumbnail, name, price; floating "Add" button
- **Item Card**: 64x64 thumbnail | Item name | Base price/KG | Edit button
- **Edit Modal**: Full-screen modal with fields for name, price, voice tag, image capture button
- **Camera**: Opens device camera, captures image, compresses to JPEG, stores as Base64

### Screen 2: Billing Entry

- **Layout**: Split view — item selector on top, current bill on bottom
- **Item Selection**: Search box + item grid/list with voice tags shown
- **Quick Entry Panel**: Row of buttons [50g] [100g] [250g] [500g] [750g] [1KG] + text input
- **Voice Button**: Microphone icon that toggles continuous recognition
- **Current Bill**: Scrollable list of line items with swipe-to-delete, tap-to-edit quantity
- **Footer**: Running total + "Finalize Bill" button

### Screen 3: Bill History

- **Layout**: Filterable list of past bills
- **Filters**: Date range picker
- **Bill Card**: Bill number | Date | Total | Tap to expand
- **Detail View**: Full bill with line items, share button (WhatsApp)

### Screen 4: Reports

- **Layout**: Tab sub-navigation (Total | Day-wise | Item-wise)
- **Date Range Selector**: Start and end date inputs
- **Total View**: Single summary card with total sales amount
- **Day-wise View**: Table/list with date and daily total
- **Item-wise View**: Table with item name, total quantity (KG), total revenue

## Key Algorithms

### Bill Number Generation

```
1. Read dailySequence from localStorage
2. If dailySequence.date !== today:
   - Reset counter to 1
   - Set date to today
3. billNumber = "ABC-" + YYYYMMDD + "-" + counter.toString().padStart(3, '0')
4. Increment counter
5. Save dailySequence to localStorage
```

### Price Calculation

```
lineTotal = item.basePricePerKg * (quantityGrams / 1000)
displayPrice = lineTotal.toFixed(2)
```

### Voice Command Parsing

```
1. Receive transcript from SpeechRecognition
2. Normalize: lowercase, replace "half kg" with "500", "one kg" with "1000", etc.
3. Tokenize into segments using item voice tags as delimiters
4. For each segment: extract item (by voice tag match) + quantity (numeric + unit)
5. Convert quantity to grams
6. Return array of { itemId, quantityGrams } pairs
7. Items without valid quantity are flagged for manual correction
```

### WhatsApp Share Format

```
🧾 *ABC Provisional Store*
Bill No: ABC-20250101-001
Date: 01-Jan-2025

Items:
1. Rice - 1 KG - ₹80.00
2. Dal - 500g - ₹65.00
3. Sugar - 250g - ₹12.50

*Total: ₹157.50*

Thank you for your purchase!
```

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Vanilla JS | No build step, minimal size, offline-first simplicity |
| Storage | IndexedDB | Handles structured data, images (blobs), larger quota than localStorage |
| Image format | JPEG Base64 | Good compression, universal browser support |
| Image size | Max 200x200 compressed | Balance between recognizability and storage |
| Voice API | Web Speech API | Native browser support, no external dependencies |
| PWA caching | Cache-first strategy | All assets cached; app works fully offline |
| Bill number | ABC-YYYYMMDD-NNN | Human-readable, sortable, includes date context |
| Currency | ₹ (Indian Rupee) | Target market assumption for provisional store |

## Correctness Properties

1. **Price Calculation Invariant**: For any Line_Item, `lineTotal === basePricePerKg * quantityGrams / 1000` (within floating point precision of 2 decimal places)
2. **Bill Total Invariant**: For any Bill, `total === sum(lineItems.map(li => li.lineTotal))` rounded to 2 decimal places
3. **Bill Number Uniqueness**: No two bills shall have the same billNumber within the app's lifetime
4. **Bill Number Sequence**: For bills on the same day, sequence numbers are strictly monotonically increasing
5. **Data Persistence Round-Trip**: Saving an item/bill to IndexedDB and reading it back produces an equivalent object
6. **Voice Tag Matching**: Voice tag matching is case-insensitive and produces at most one match per spoken segment
7. **Quantity Conversion Idempotence**: Converting a display quantity (e.g., "500g") to grams and back to display produces the same string

## Component Interaction Flow

```
[User Voice/Touch Input]
        │
        ▼
[Voice Engine / UI Events]
        │
        ▼
[Billing Module] ──────► [Item Master DB Query]
        │                         │
        │                         ▼
        │                 [Return item + price]
        │
        ▼
[Calculate Line Total]
        │
        ▼
[Update Current Bill State]
        │
        ▼
[Render Bill UI]
        │
        ▼ (on finalize)
[Generate Bill Number] ──► [Store to IndexedDB]
        │
        ▼
[Reports Module] ◄──── [Query bills from DB]
```
