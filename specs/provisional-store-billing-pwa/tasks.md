# Implementation Tasks

## Task 1: Project Setup and PWA Foundation

- [x] 1.1 Create project folder structure (index.html, css/, js/, icons/)
- [x] 1.2 Create index.html with SPA shell, tab navigation (Item Master, Billing, History, Reports), and meta tags for PWA
- [x] 1.3 Create manifest.json with app name "ABC Store", theme color, display standalone, and icon references
- [x] 1.4 Create service worker (sw.js) with cache-first strategy that caches all application assets
- [x] 1.5 Create app.js with service worker registration, tab routing, and app initialization
- [x] 1.6 Create base styles.css with responsive layout, tab navigation styles, and mobile-first design

## Task 2: Database Layer (IndexedDB)

- [x] 2.1 Create db.js with IndexedDB wrapper: open database "ABCStore" with version 1
- [x] 2.2 Implement `items` object store with keyPath "id" and indexes on "name" and "voiceTag"
- [x] 2.3 Implement `bills` object store with keyPath "id" and indexes on "billNumber" and "date"
- [x] 2.4 Implement CRUD methods: addItem, getItem, getAllItems, updateItem, deleteItem
- [x] 2.5 Implement bill methods: saveBill, getBill, getAllBills, getBillsByDateRange

## Task 3: Utility Module

- [x] 3.1 Create utils.js with bill number generation (ABC-YYYYMMDD-NNN format with daily sequence reset)
- [x] 3.2 Implement price calculation function: calculateLineTotal(basePricePerKg, quantityGrams)
- [x] 3.3 Implement quantity display formatter (grams to "50g", "100g", "0.5 KG", "1 KG" display)
- [x] 3.4 Implement WhatsApp share text formatter (bill to formatted text string)
- [x] 3.5 Implement UUID generator for item and bill IDs

## Task 4: Item Master Screen

- [x] 4.1 Create item-master.js with screen rendering: item list with thumbnail, name, price, edit button
- [x] 4.2 Implement "Add Item" modal with fields: name, base price per KG, voice tag, image capture button
- [x] 4.3 Implement camera capture using MediaDevices API (getUserMedia) with fallback message
- [x] 4.4 Implement image compression using Canvas API (resize to max 200x200, JPEG quality 0.6, store as Base64)
- [x] 4.5 Implement item save/update with validation (name and price required)
- [x] 4.6 Implement item list rendering with 64x64 thumbnails and search/filter capability

## Task 5: Billing Entry Screen

- [x] 5.1 Create billing.js with screen layout: item selector area, quick entry panel, current bill list
- [x] 5.2 Implement item selection: searchable item list/grid showing name, thumbnail, and voice tag
- [x] 5.3 Implement Quick Entry Panel with preset buttons (50g, 100g, 250g, 500g, 750g, 1KG) and custom input text box
- [x] 5.4 Implement "Add to Bill" action: create Line_Item with calculated price, append to current bill
- [x] 5.5 Implement bill line item display with item name, quantity, price, and running total
- [x] 5.6 Implement line item edit: tap to update quantity, recalculate price
- [x] 5.7 Implement line item delete: swipe or delete button to remove item, update total
- [x] 5.8 Implement "Finalize Bill" action: generate bill number, save to IndexedDB, clear current bill

## Task 6: Voice Engine

- [x] 6.1 Create voice-engine.js with Web Speech API initialization and browser support detection
- [x] 6.2 Implement continuous speech recognition start/stop with microphone button toggle
- [x] 6.3 Implement voice command parser: tokenize transcript, match voice tags, extract quantities
- [x] 6.4 Implement quantity word-to-grams conversion ("half kg" → 500, "one kg" → 1000, "hundred gram" → 100)
- [x] 6.5 Integrate voice engine with billing screen: add recognized item-quantity pairs as Line_Items
- [x] 6.6 Implement unrecognized segment highlighting for manual correction

## Task 7: Bill History Screen

- [x] 7.1 Create bill-history.js with history list rendering: bill number, date, total amount
- [x] 7.2 Implement date range filter with start/end date inputs
- [x] 7.3 Implement bill detail view: expand to show all line items with quantities and prices
- [x] 7.4 Implement WhatsApp share button: generate formatted text and open wa.me URL
- [x] 7.5 Implement clipboard fallback for devices without WhatsApp support

## Task 8: Reports Screen

- [x] 8.1 Create reports.js with sub-tab navigation (Total, Day-wise, Item-wise) and date range selector
- [x] 8.2 Implement total sales view: aggregate total from bills in selected date range
- [x] 8.3 Implement day-wise view: group bills by date, display daily totals in a list/table
- [x] 8.4 Implement item-wise view: aggregate quantities and revenue per item across selected date range

## Task 9: Final Integration and Testing

- [x] 9.1 Test complete billing flow: add items → create bill → finalize → view in history
- [x] 9.2 Test voice billing flow: speak items with quantities → verify line items added correctly
- [x] 9.3 Test offline capability: load app, disable network, verify all features work
- [x] 9.4 Test WhatsApp sharing: verify formatted text and URL scheme
- [x] 9.5 Update service worker cache list with all final assets
- [x] 9.6 Test PWA installation on mobile device (manifest, icons, standalone mode)
