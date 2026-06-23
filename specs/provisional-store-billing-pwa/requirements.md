# Requirements Document

## Introduction

A Progressive Web App (PWA) for "ABC" provisional store that enables the merchant to manage item inventory and perform billing operations. The app works entirely offline using browser local storage, supports voice-enabled billing entry, item image capture via mobile camera, and provides sales reporting with WhatsApp sharing capability.

## Glossary

- **PWA**: Progressive Web App — a web application that uses service workers, manifests, and other web-platform features to provide an app-like experience
- **Billing_System**: The core billing module of the ABC provisional store PWA responsible for creating, storing, and managing bills
- **Item_Master**: The module responsible for managing the catalog of items including name, base selling price, image, and voice tag
- **Voice_Engine**: The component that uses the Web Speech API to recognize voice commands for billing entry
- **Bill**: A transaction record containing one or more line items with quantities, calculated prices, and a unique bill number
- **Line_Item**: A single entry in a bill representing an item, its quantity, unit, and calculated or manually overridden price
- **Price_Override**: A merchant-entered price value that replaces the auto-calculated line item price for a specific Line_Item
- **Base_Price**: The selling price per kilogram (or per base unit) defined for each item in the Item Master
- **Voice_Tag**: A spoken keyword or phrase associated with an item, used for voice-based item identification during billing
- **Quick_Entry_Panel**: A UI component with preset quantity buttons for rapid unit selection during billing
- **Reports_Module**: The module responsible for generating and displaying sales summaries (total, day-wise, item-wise)
- **Local_Storage**: Browser localStorage and IndexedDB used to persist all app data offline
- **Bill_Number**: A unique sequential identifier generated for each bill

## Requirements

### Requirement 1: Item Master - Create and Modify Items

**User Story:** As a merchant, I want to create and modify items with their base selling price, so that I can maintain an up-to-date catalog for billing.

#### Acceptance Criteria

1. THE Item_Master SHALL provide a screen to add new items with name and base selling price per kilogram
2. WHEN the merchant selects an existing item, THE Item_Master SHALL allow modification of the item name and base selling price
3. THE Item_Master SHALL persist all item data to Local_Storage immediately after creation or modification
4. WHEN an item is saved without a name or base price, THE Item_Master SHALL display a validation error indicating the missing field

### Requirement 2: Item Image Capture

**User Story:** As a merchant, I want to capture and view item images, so that I can visually identify items quickly during billing.

#### Acceptance Criteria

1. THE Item_Master SHALL display the item image as a thumbnail (maximum 64x64 pixels) in the item list view
2. WHEN the merchant taps the image area on a mobile device, THE Item_Master SHALL open the device camera for photo capture
3. WHEN a photo is captured, THE Item_Master SHALL store the image as a compressed Base64 string in Local_Storage
4. IF the device camera is unavailable, THEN THE Item_Master SHALL display a message indicating camera access is not supported

### Requirement 3: Voice Tag for Items

**User Story:** As a merchant, I want to assign a voice tag to each item, so that I can identify items by voice during billing entry.

#### Acceptance Criteria

1. THE Item_Master SHALL provide a text field to enter or modify a voice tag for each item
2. WHEN the merchant records a voice tag, THE Item_Master SHALL store the voice tag text associated with the item in Local_Storage
3. WHEN a voice command is received during billing, THE Voice_Engine SHALL match the spoken word against all stored voice tags to identify the item
4. IF the Voice_Engine cannot match a spoken word to any voice tag, THEN THE Billing_System SHALL display an unrecognized item notification

### Requirement 4: Quantity-Based Price Calculation

**User Story:** As a merchant, I want to enter selling quantities in smaller units and have the price auto-calculated, so that I can bill fractional quantities accurately.

#### Acceptance Criteria

1. THE Billing_System SHALL support quantity entry in the following units: 50 grams, 100 grams, 250 grams, 500 grams (1/2 KG), 750 grams, and 1 KG
2. WHEN a quantity is entered for an item, THE Billing_System SHALL calculate the line item price as (Base_Price × quantity_in_grams / 1000)
3. THE Billing_System SHALL display the calculated price rounded to two decimal places
4. WHEN the merchant enters a custom quantity in grams, THE Billing_System SHALL accept any positive numeric value and calculate the price accordingly

### Requirement 5: Voice-Enabled Billing Entry

**User Story:** As a merchant, I want to speak item names and quantities in a single voice command, so that I can create bills hands-free.

#### Acceptance Criteria

1. WHEN the merchant activates voice mode, THE Voice_Engine SHALL begin continuous speech recognition
2. THE Voice_Engine SHALL parse a single voice command containing multiple items and quantities (e.g., "item1 100 gram item2 1 KG")
3. WHEN a valid item-quantity pair is recognized, THE Billing_System SHALL add the corresponding Line_Item to the current bill
4. WHEN the voice command contains multiple item-quantity pairs, THE Billing_System SHALL add all recognized pairs as separate Line_Items in sequence
5. IF the Voice_Engine fails to parse a segment of the voice command, THEN THE Billing_System SHALL highlight the unrecognized segment for manual correction

### Requirement 6: Quick Entry Panel for Billing

**User Story:** As a merchant, I want quick-access buttons for common quantities along with an editable text box, so that I can rapidly enter quantities during billing.

#### Acceptance Criteria

1. THE Billing_System SHALL display a Quick_Entry_Panel with preset buttons for 50g, 100g, 250g, 500g, 750g, and 1KG
2. WHEN the merchant taps a preset quantity button, THE Billing_System SHALL set the quantity for the selected item to the corresponding value
3. THE Billing_System SHALL display an editable text box allowing manual entry of custom quantity in grams
4. WHEN a custom quantity is entered in the text box, THE Billing_System SHALL override any preset button selection with the manually entered value

### Requirement 7: Bill Line Item Management

**User Story:** As a merchant, I want to scroll through, delete, update quantities, or override prices of items already added to a bill, so that I can review and correct the bill during entry.

#### Acceptance Criteria

1. THE Billing_System SHALL display all Line_Items in the current bill within a vertically scrollable list on the bill generation screen
2. WHILE the current bill contains more Line_Items than the visible area can display, THE Billing_System SHALL allow the merchant to scroll through the complete list of Line_Items
3. WHEN the merchant selects a Line_Item in the current bill, THE Billing_System SHALL allow updating the quantity
4. WHEN the quantity is updated, THE Billing_System SHALL recalculate the line item price using the updated quantity
5. WHEN the merchant selects a Line_Item in the current bill, THE Billing_System SHALL allow overriding the auto-calculated price with a manually entered price value
6. WHEN the merchant enters a manual price override for a Line_Item, THE Billing_System SHALL replace the auto-calculated price with the merchant-specified value for that Line_Item
7. WHEN a Line_Item price is overridden manually, THE Billing_System SHALL recalculate the bill total immediately using the overridden price
8. WHEN the merchant requests deletion of a Line_Item, THE Billing_System SHALL remove the item from the current bill
9. THE Billing_System SHALL update the bill total immediately after any Line_Item addition, quantity modification, price override, or deletion

### Requirement 8: Bill Storage and Bill Number Generation

**User Story:** As a merchant, I want each completed bill to be saved with a unique bill number, so that I can reference and track bills.

#### Acceptance Criteria

1. WHEN a bill is finalized, THE Billing_System SHALL generate a unique sequential Bill_Number in the format "ABC-YYYYMMDD-NNN" where NNN is the daily sequence number
2. WHEN a bill is finalized, THE Billing_System SHALL store the complete bill (bill number, date, time, line items, and total) in Local_Storage
3. THE Billing_System SHALL maintain a monotonically increasing daily sequence counter that resets to 001 at the start of each day
4. IF Local_Storage write fails, THEN THE Billing_System SHALL display an error message and retain the bill data in memory for retry

### Requirement 9: Bill History View

**User Story:** As a merchant, I want to view past bills, so that I can reference previous transactions.

#### Acceptance Criteria

1. THE Billing_System SHALL provide a history screen listing all stored bills with bill number, date, and total amount
2. WHEN the merchant selects a bill from the history list, THE Billing_System SHALL display the full bill details including all Line_Items
3. THE Billing_System SHALL sort the history list by date in descending order (most recent first)
4. THE Billing_System SHALL allow the merchant to filter history by date range

### Requirement 10: Sales Reports

**User Story:** As a merchant, I want to view total sales summaries day-wise and item-wise, so that I can track business performance.

#### Acceptance Criteria

1. THE Reports_Module SHALL display total sales amount for a selected date range
2. WHEN the merchant selects day-wise view, THE Reports_Module SHALL display daily sales totals grouped by date
3. WHEN the merchant selects item-wise view, THE Reports_Module SHALL display total quantity sold and total revenue for each item
4. THE Reports_Module SHALL calculate all report data from bills stored in Local_Storage

### Requirement 11: WhatsApp Bill Sharing

**User Story:** As a merchant, I want to send a bill summary via WhatsApp, so that I can share the bill with customers.

#### Acceptance Criteria

1. WHEN the merchant selects the share option for a bill, THE Billing_System SHALL generate a formatted text summary containing the store name, bill number, date, item list with quantities and prices, and total amount
2. WHEN the share action is triggered, THE Billing_System SHALL open the WhatsApp share URL (wa.me) with the pre-formatted bill text
3. THE Billing_System SHALL format the bill summary text with line breaks and alignment suitable for WhatsApp messaging
4. IF the device does not support WhatsApp URL scheme, THEN THE Billing_System SHALL copy the bill summary text to the clipboard and display a confirmation message

### Requirement 12: PWA Offline Capability

**User Story:** As a merchant, I want the app to work completely offline, so that I can use it in areas with poor internet connectivity.

#### Acceptance Criteria

1. THE PWA SHALL register a service worker that caches all application assets for offline use
2. WHEN the app is loaded without network connectivity, THE PWA SHALL serve all screens and functionality from the service worker cache
3. THE PWA SHALL provide a web app manifest enabling installation on mobile home screens
4. THE PWA SHALL store all data exclusively in Local_Storage without requiring server connectivity
