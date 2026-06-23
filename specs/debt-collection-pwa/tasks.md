# Implementation Plan: Debt Collection PWA

## Overview

Build a Progressive Web App for debt collection management using vanilla HTML/CSS/JS with IndexedDB for structured data and localStorage for settings. The app will be located at `Collection_App/` in the workspace root, following the same architectural patterns as the existing ABC_Store PWA.

## Tasks

- [x] 1. Set up project structure and PWA foundation
  - [x] 1.1 Create folder structure and manifest.json
    - Create `Collection_App/` directory with subdirectories: `css/`, `js/`, `icons/`
    - Create `manifest.json` with name, short_name (both defaulting to "ABC Debt Collection"), start_url: "./index.html", display: "standalone", theme_color, background_color, and icon entries for icon-192.png and icon-512.png
    - Create placeholder icon files `icons/icon-192.png` and `icons/icon-512.png` (simple colored square PNGs)
    - _Requirements: 12.1_

  - [x] 1.2 Create service worker shell (sw.js)
    - Create `sw.js` with install, activate, and fetch event listeners
    - Define CACHE_NAME with version string and FILES_TO_CACHE array listing all app assets
    - Implement cache-first strategy in fetch handler
    - On install: open cache, addAll files; on failure do not activate incomplete cache
    - On activate: delete old caches, claim clients
    - _Requirements: 12.2, 12.3, 12.4, 12.5_

  - [x] 1.3 Create QR code library file (qrcode-lib.js)
    - Add the qrcode-generator library by Kazuhiko Arase as `js/qrcode-lib.js`
    - This provides the `qrcode(typeNumber, errorCorrectionLevel)` factory function
    - _Requirements: 5.1_

- [x] 2. Implement IndexedDB module (db.js)
  - [x] 2.1 Create IndexedDB wrapper module
    - Create `js/db.js` as an IIFE exposing a global `DB` object
    - Database name: "CollectionApp", version: 1
    - Object store "clients": keyPath "id", indexes on "name" (unique) and "mobile"
    - Object store "payments": keyPath "id", indexes on "clientId" and "date"
    - Implement `init()` to open/create the database with onupgradeneeded handler
    - Implement client methods: `addClient(client)`, `getClient(id)`, `getAllClients()`, `updateClient(client)`, `deleteClient(id)`
    - Implement payment methods: `addPayment(payment)`, `getPaymentsByClient(clientId)`, `getPaymentsByDateRange(start, end)`, `getPaymentsByClientAndDate(clientId, date)`, `deletePaymentsByClient(clientId)`
    - All methods return Promises; handle storage errors by rejecting with descriptive messages
    - _Requirements: 11.1, 11.2, 11.4, 11.5_

  - [ ]* 2.2 Write property test for Client Name uniqueness enforcement
    - **Property 3: Client Name Uniqueness Enforcement**
    - **Validates: Requirements 1.2, 2.2, 13.5**

  - [ ]* 2.3 Write property test for Payment Recording Round-Trip
    - **Property 6: Payment Recording Round-Trip**
    - **Validates: Requirements 7.2, 7.3**

  - [ ]* 2.4 Write property test for Client Deletion cascading to payments
    - **Property 20: Client Deletion Cascades to Payments**
    - **Validates: Requirements 3.2**

- [x] 3. Implement app shell (index.html and app.js)
  - [x] 3.1 Create index.html with all section placeholders and navigation
    - Create `index.html` with HTML5 doctype, meta viewport for mobile, manifest link, and theme-color meta
    - Add `<header>` with AppName display
    - Add 5 `<section>` elements: `#clients-section`, `#collection-section`, `#history-section`, `#reports-section`, `#settings-section`
    - Add bottom navigation bar with 5 tab buttons (Clients, Collection, History, Reports, Settings) with icons/labels
    - Link all CSS and JS files in correct order (db.js first, then modules, then app.js last)
    - Register service worker via app.js
    - _Requirements: 10.1, 10.2, 12.1_

  - [x] 3.2 Create app.js with navigation and initialization logic
    - Create `js/app.js` as the application controller
    - Implement `registerServiceWorker()` to register sw.js with update detection and user notification
    - Implement `navigateToScreen(screenId)` to show/hide sections and update active tab styling
    - Implement `setupTabNavigation()` to attach click handlers to nav tabs
    - Implement `updateAppName()` to read AppName from localStorage, update header text and document.title
    - Implement `initApp()` as main entry: call DB.init(), setup navigation, initialize all modules, update AppName
    - Call `initApp()` on DOMContentLoaded
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 12.2, 12.5_

- [x] 4. Implement CSS styles (styles.css)
  - [x] 4.1 Create mobile-first responsive stylesheet
    - Create `css/styles.css` with CSS custom properties for colors and spacing
    - Implement mobile-first base styles: body, typography, form elements
    - Style bottom navigation bar (fixed, 5 equal tabs, active state highlighting)
    - Style section containers (only active section visible via display)
    - Style client list items (card layout with name, pending amount, action buttons)
    - Style forms (full-width inputs, labels, validation error states with red borders and error text)
    - Style daily collection list (client cards with editable EMI, collect button)
    - Style payment page (QR code container centered, amount field, confirm button)
    - Style history and reports tables (responsive, scrollable on small screens)
    - Style toast notifications (fixed position, auto-dismiss animation)
    - Style modals/confirmation dialogs
    - Style print media query: hide nav, buttons, date selectors; show only header, date range, report table
    - Add responsive breakpoints for tablet/desktop (max-width based)
    - _Requirements: 9.7, 9.8_

- [x] 5. Checkpoint - Verify project structure
  - Ensure all files are created and the basic app shell loads correctly in a browser. Ask the user if questions arise.

- [x] 6. Implement Settings module (settings.js)
  - [x] 6.1 Create settings module with UPI_ID and AppName management
    - Create `js/settings.js` as an IIFE exposing a global `Settings` object
    - Define KEYS constant: `{ UPI_ID: 'upi_id', APP_NAME: 'app_name' }` and DEFAULTS: `{ APP_NAME: 'ABC Debt Collection' }`
    - Implement `init()`: populate form fields with stored values or defaults on page load
    - Implement `save()`: validate UPI_ID is not empty/whitespace-only, validate AppName max 50 chars, validate UPI_ID max 45 chars and matches `username@provider` format; persist to localStorage; show 3-second success toast; call `updateAppName()` from app.js to immediately update headers/title
    - Implement `getUpiId()`: return stored UPI_ID or null
    - Implement `getAppName()`: return stored AppName or default "ABC Debt Collection"
    - Handle localStorage unavailability with error display
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 10.4_

  - [ ]* 6.2 Write property test for Settings Persistence Round-Trip
    - **Property 18: Settings Persistence Round-Trip**
    - **Validates: Requirements 4.6**

  - [ ]* 6.3 Write property test for Whitespace UPI_ID Rejection
    - **Property 19: Whitespace UPI_ID Rejection**
    - **Validates: Requirements 4.4**

- [x] 7. Implement Client Master module (clients.js)
  - [x] 7.1 Create client master CRUD module
    - Create `js/clients.js` as an IIFE exposing a global `ClientMaster` object
    - Implement `init()`: set up event listeners for add/edit/delete buttons, render initial client list
    - Implement `renderClientList()`: fetch all clients from DB, display as card list with name, mobile, total amount, pending amount, and edit/delete buttons
    - Implement `showAddForm()`: show blank form with Duration defaulting to 100, startDate to today
    - Implement `showEditForm(id)`: load client data from DB, populate all form fields
    - Implement `validateForm(data)`: check all mandatory fields (name, mobile, amount, startDate), validate mobile is exactly 10 digits, amount > 0, duration > 0, check name uniqueness (case-insensitive, trimmed) excluding current record on edit; return array of error objects with field name and message
    - Implement `saveClient(data)`: generate UUID for new records, calculate EMI and endDate, call DB.addClient or DB.updateClient; on success refresh list; on failure show error without clearing form
    - Implement `deleteClient(id)`: show confirmation dialog with client name; on confirm call DB.deleteClient and DB.deletePaymentsByClient; update list
    - Implement `calculateEMI(amount, duration)`: return `Math.round((amount / duration) * 100) / 100`
    - Implement `calculateEndDate(startDate, duration)`: add duration days to startDate, return ISO date string
    - Auto-recalculate EMI and endDate when amount or duration changes (attach input event listeners)
    - Allow manual EMI editing after auto-calculation
    - Preserve all form data on validation errors
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ]* 7.2 Write property test for EMI Calculation Correctness
    - **Property 1: EMI Calculation Correctness**
    - **Validates: Requirements 1.4, 2.4**

  - [ ]* 7.3 Write property test for End Date Calculation Correctness
    - **Property 2: End Date Calculation Correctness**
    - **Validates: Requirements 1.5, 2.4**

  - [ ]* 7.4 Write property test for Mandatory Field Validation
    - **Property 11: Mandatory Field Validation**
    - **Validates: Requirements 1.7, 13.1**

  - [ ]* 7.5 Write property test for Mobile Number Validation
    - **Property 12: Mobile Number Validation**
    - **Validates: Requirements 13.4**

  - [ ]* 7.6 Write property test for Amount Validation
    - **Property 13: Amount Validation (Client)**
    - **Validates: Requirements 13.2**

  - [ ]* 7.7 Write property test for Duration Validation
    - **Property 14: Duration Validation**
    - **Validates: Requirements 13.3**

  - [ ]* 7.8 Write property test for Form State Preservation on Validation Error
    - **Property 21: Form State Preservation on Validation Error**
    - **Validates: Requirements 13.6**

- [x] 8. Checkpoint - Verify client master and settings
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Daily Collection module (collection.js)
  - [x] 9.1 Create daily collection and payment module
    - Create `js/collection.js` as an IIFE exposing a global `Collection` object
    - Implement `init()`: set up date selector defaulting to today, attach date change listener, render initial list
    - Implement `renderCollectionList(date)`: get all clients from DB, for each client calculate pending amount (totalAmount - sum of all payments), filter to those with pending > 0, sort alphabetically by name, display each with name, pending amount, EMI (editable input bounded 1 to pending), and Collect button
    - Implement `showPaymentPage(clientId, amount)`: check UPI_ID exists (show error directing to Settings if not), generate QR code with UPI link, display client name and amount (editable), show Confirm and Cancel buttons
    - Implement `generateQRCode(upiId, appName, amount, clientName)`: build UPI link string `upi://pay?pa=<upiId>&pn=<appName>&am=<amount.toFixed(2)>&cu=INR&tn=<clientName>`, create QR using qrcode-lib, render to container; on failure show fallback tappable link
    - Implement `confirmPayment(clientId, date, amount)`: validate amount > 0, create payment record with UUID, call DB.addPayment; on success refresh collection list and show toast; on failure show error without updating pending
    - Implement `calculatePending(client)`: get all payments for client, return totalAmount - sum of amounts
    - Show "No pending collections" message when list is empty
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 9.2 Write property test for Pending Amount Calculation
    - **Property 4: Pending Amount Calculation**
    - **Validates: Requirements 7.4**

  - [ ]* 9.3 Write property test for UPI Payment Link Format
    - **Property 5: UPI Payment Link Format**
    - **Validates: Requirements 5.2, 10.5**

  - [ ]* 9.4 Write property test for Daily Collection List Filtering
    - **Property 7: Daily Collection List Filtering**
    - **Validates: Requirements 6.2, 6.6**

  - [ ]* 9.5 Write property test for Payment Amount Validation
    - **Property 15: Payment Amount Validation**
    - **Validates: Requirements 7.5**

  - [ ]* 9.6 Write property test for Collection Amount Bounds
    - **Property 16: Collection Amount Bounds**
    - **Validates: Requirements 6.4**

- [x] 10. Implement Payment History module (history.js)
  - [x] 10.1 Create payment history filtering and display module
    - Create `js/history.js` as an IIFE exposing a global `PaymentHistory` object
    - Implement `init()`: set up start date (default: 30 days ago) and end date (default: today) inputs, attach change listeners, render initial history
    - Implement `loadAndRenderHistory()`: validate date range (start <= end, show error if not), call DB.getPaymentsByDateRange, for each payment resolve client name from DB, sort by date descending, render table with date, client name, and amount columns
    - Implement `validateDateRange(start, end)`: return true if start <= end, else display error message
    - Show "No records found" message when no payments match the filter
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 10.2 Write property test for Payment History Date Range Filtering
    - **Property 8: Payment History Date Range Filtering**
    - **Validates: Requirements 8.2, 9.4**

  - [ ]* 10.3 Write property test for Date Range Validation
    - **Property 17: Date Range Validation**
    - **Validates: Requirements 8.4**

- [x] 11. Implement Reports module (reports.js)
  - [x] 11.1 Create reports module with day-wise and client-wise views
    - Create `js/reports.js` as an IIFE exposing a global `Reports` object
    - Implement `init()`: set up date range (default: first of current month to today), report type toggle (Day-wise / Client-wise tabs), attach listeners
    - Implement `generateDayWiseReport(start, end)`: get payments in range, group by date, sum amounts per date, sort by date descending, return array of {date, total}
    - Implement `generateClientWiseReport(start, end)`: get payments in range, group by clientId, resolve client names, sum amounts per client, sort alphabetically by name, return array of {name, total}
    - Implement `renderReport(data, type)`: render as HTML table based on type (date+total or name+total)
    - Implement `printReport()`: trigger `window.print()` — relies on CSS print media query to hide nav/buttons and show only AppName header, date range, and active report table
    - Add Print button visible on both report views
    - Show "No collection data available" message when no payments match the filter
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 11.2 Write property test for Day-Wise Report Aggregation
    - **Property 9: Day-Wise Report Aggregation**
    - **Validates: Requirements 9.2**

  - [ ]* 11.3 Write property test for Client-Wise Report Aggregation
    - **Property 10: Client-Wise Report Aggregation**
    - **Validates: Requirements 9.3**

- [x] 12. Final checkpoint - Ensure all modules work together
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The QR code library (qrcode-lib.js) is a third-party file from Kazuhiko Arase — it should be copied as-is from the qrcode-generator project
- Icon files (icon-192.png, icon-512.png) can be simple generated placeholder images initially
- All JavaScript modules use the IIFE/revealing module pattern exposing global objects
- The implementation language is vanilla JavaScript (ES6+) with no build step required

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8"] },
    { "id": 7, "tasks": ["9.1", "10.1", "11.1"] },
    { "id": 8, "tasks": ["9.2", "9.3", "9.4", "9.5", "9.6", "10.2", "10.3", "11.2", "11.3"] }
  ]
}
```
