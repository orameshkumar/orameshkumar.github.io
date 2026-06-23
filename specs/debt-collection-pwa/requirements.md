# Requirements Document

## Introduction

ABC Collection App is a Progressive Web App (PWA) for managing debt collection operations. It enables a collector to register clients with their borrowed amounts, track daily EMI payments via UPI QR code, and view reports on collection progress. The app works offline using browser local storage (IndexedDB) and is installable on mobile devices.

## Glossary

- **App**: The ABC Collection App PWA
- **Client_Master**: The screen and data store for managing client records including name, mobile number, borrowed amount, duration, and EMI details
- **Client_Record**: A single entry in the Client Master representing one borrower
- **Daily_Collection_Page**: The screen for recording daily payments against active clients
- **Payment_Record**: A single payment entry recording the amount collected from a client on a specific date
- **EMI**: Equated Monthly Installment — in this context, the daily installment amount calculated as total borrowed amount divided by duration in days
- **Pending_Amount**: The difference between total borrowed amount and total amount already paid by a client
- **Duration**: The number of days over which the debt is to be repaid, defaulting to 100 days
- **End_Date**: The calculated date derived by adding Duration days to the Collection Start Date
- **UPI_ID**: Unified Payments Interface identifier used for receiving payments
- **QR_Code**: A machine-readable code generated from the UPI payment link using the qrcode-generator library by Kazuhiko Arase
- **Settings_Page**: The configuration screen for managing UPI payment details and application name
- **Payment_History_Page**: The screen for viewing payment records filtered by date range
- **Reports_Page**: The screen for viewing aggregated collection data by day or by client
- **AppName**: A configurable application name stored in settings, defaulting to "ABC Debt Collection", used for page titles, headers, PWA manifest name, and QR code payee name throughout the App
- **Local_Storage**: Browser-based storage (IndexedDB or localStorage) used to persist all application data on the device

## Requirements

### Requirement 1: Client Record Creation

**User Story:** As a collector, I want to add new client records with their borrowing details, so that I can track their debt and repayment schedule.

#### Acceptance Criteria

1. WHEN the collector submits a new client form, THE Client_Master SHALL create a Client_Record with Client Name (maximum 100 characters), mobile number (exactly 10 digits), total borrowed amount (0.01 to 99,99,999.99), collection start date, duration (1 to 999 days), and EMI
2. IF the collector submits a Client Name that already exists (case-insensitive, ignoring leading and trailing spaces) in Client_Records, THEN THE Client_Master SHALL reject the submission and display an error message indicating the name is already in use
3. THE Client_Master SHALL default the Duration field to 100 days when creating a new Client_Record
4. WHEN the collector enters a total borrowed amount and duration, THE Client_Master SHALL calculate the EMI as total borrowed amount divided by duration, rounded to 2 decimal places
5. WHEN the collector modifies the duration or total borrowed amount, THE Client_Master SHALL recalculate the End_Date as collection start date plus duration in days
6. THE Client_Master SHALL allow the collector to manually edit the EMI value after automatic calculation
7. IF the collector submits the new client form with any mandatory field (Client Name, mobile number, total borrowed amount, or collection start date) left empty, THEN THE Client_Master SHALL reject the submission and indicate which fields are missing

### Requirement 2: Client Record Modification

**User Story:** As a collector, I want to edit existing client records, so that I can correct errors or update borrowing details.

#### Acceptance Criteria

1. WHEN the collector selects a Client_Record for editing, THE Client_Master SHALL display the current values of Client Name, mobile number, total borrowed amount, collection start date, duration, and EMI in an editable form
2. WHEN the collector saves changes to a Client_Record, THE Client_Master SHALL validate uniqueness of the Client Name against all other Client_Records, excluding the record being edited
3. IF the edited Client Name matches an existing Client_Record name, THEN THE Client_Master SHALL display an error message indicating the name already exists and SHALL prevent saving
4. WHEN the collector modifies total borrowed amount or duration, THE Client_Master SHALL recalculate EMI as total borrowed amount divided by duration and End_Date as collection start date plus duration in days
5. THE Client_Master SHALL allow the collector to manually edit the EMI value after automatic recalculation during modification

### Requirement 3: Client Record Deletion

**User Story:** As a collector, I want to delete client records, so that I can remove entries that are no longer relevant.

#### Acceptance Criteria

1. WHEN the collector requests deletion of a Client_Record, THE Client_Master SHALL display a confirmation prompt showing the Client Name and requesting explicit confirmation before proceeding
2. WHEN the collector confirms deletion, THE Client_Master SHALL remove the Client_Record and all associated Payment_Records from Local_Storage and update the client list to no longer display the deleted record
3. IF the collector cancels the deletion confirmation, THEN THE Client_Master SHALL retain the Client_Record and all associated Payment_Records unchanged and return to the client list view
4. IF the deletion operation fails due to a storage error, THEN THE Client_Master SHALL display an error message indicating the record was not deleted and retain the Client_Record unchanged

### Requirement 4: Settings Configuration

**User Story:** As a collector, I want to configure my UPI payment details and application name, so that QR codes for collection can be generated with my payment information and the app displays my preferred business name.

#### Acceptance Criteria

1. THE Settings_Page SHALL allow the collector to enter and save a UPI_ID in the format `username@provider` with a maximum length of 45 characters
2. THE Settings_Page SHALL allow the collector to enter and save an AppName with a maximum length of 50 characters
3. THE Settings_Page SHALL default the AppName field to "ABC Debt Collection" when no AppName value exists in Local_Storage
4. IF the collector attempts to save an empty or whitespace-only UPI_ID, THEN THE App SHALL display an error indication and SHALL NOT persist the value to Local_Storage
5. WHEN the collector saves a valid UPI_ID and AppName, THE App SHALL persist both values in Local_Storage and SHALL display a save confirmation message for 3 seconds
6. WHEN the collector opens the Settings_Page, THE App SHALL populate the UPI_ID input field and the AppName input field with their previously saved values from Local_Storage, or use defaults if no values exist
7. IF Local_Storage is unavailable or the save operation fails, THEN THE App SHALL display an error indication informing the collector that settings could not be saved
8. WHEN the collector saves a new AppName, THE App SHALL immediately update all visible page titles and headers to reflect the new AppName value without requiring a page reload

### Requirement 5: QR Code Generation

**User Story:** As a collector, I want a UPI QR code generated for each payment, so that clients can scan and pay directly.

#### Acceptance Criteria

1. WHEN the collector initiates a payment collection for a client, THE App SHALL generate a QR_Code using the qrcode-generator library by Kazuhiko Arase and display it on the payment page showing the client name and the payment amount
2. THE QR_Code SHALL encode a UPI payment link in the format `upi://pay?pa=<UPI_ID>&pn=<AppName>&am=<AMOUNT>&cu=INR&tn=<CLIENT_NAME>`, where the AppName is the configured application name from settings, the amount is formatted to exactly 2 decimal places, and the currency is INR
3. IF no UPI_ID is configured in settings, THEN THE App SHALL display an error message directing the collector to configure UPI settings first
4. IF QR_Code generation fails, THEN THE App SHALL display a fallback containing the UPI payment link as a tappable hyperlink so the collector can still initiate payment

### Requirement 6: Daily Collection Listing

**User Story:** As a collector, I want to see a list of clients with pending payments for a selected date, so that I can collect their daily installments.

#### Acceptance Criteria

1. THE Daily_Collection_Page SHALL display a date selector at the top, defaulting to the current date
2. WHEN a date is selected, THE Daily_Collection_Page SHALL list all Client_Records where total borrowed amount is greater than total amount already paid, sorted alphabetically by Client Name
3. WHEN a date is selected, THE Daily_Collection_Page SHALL display for each listed client the Client Name, Pending_Amount, and EMI amount
4. THE Daily_Collection_Page SHALL allow the collector to edit the EMI amount for each listed client to a value between 1 and the client's current Pending_Amount before collecting payment
5. IF no Client_Records have a Pending_Amount greater than zero, THEN THE Daily_Collection_Page SHALL display a message indicating no pending collections exist for the selected date
6. WHEN a payment has already been recorded for a client on the selected date, THE Daily_Collection_Page SHALL still display that client in the list if their Pending_Amount remains greater than zero

### Requirement 7: Payment Collection

**User Story:** As a collector, I want to record payments against clients, so that I can track their repayment progress.

#### Acceptance Criteria

1. WHEN the collector taps the collect button for a client, THE App SHALL open a payment page displaying the QR_Code with the EMI amount pre-filled in an editable amount field
2. WHEN the collector confirms the payment, THE App SHALL create a Payment_Record with the client identifier, the date currently selected on the Daily_Collection_Page, and the amount displayed in the amount field at the time of confirmation
3. WHEN a Payment_Record is created, THE App SHALL persist the Payment_Record in Local_Storage
4. WHEN a payment is recorded, THE Daily_Collection_Page SHALL recalculate the Pending_Amount for that client as total borrowed amount minus the sum of all recorded payments for that client
5. IF the collector attempts to confirm a payment with an amount of zero or negative value, THEN THE App SHALL display a validation error and prevent recording the payment
6. IF the Payment_Record fails to persist to Local_Storage, THEN THE App SHALL display an error message indicating the payment was not saved and SHALL NOT update the Pending_Amount on the Daily_Collection_Page

### Requirement 8: Payment History

**User Story:** As a collector, I want to view payment history filtered by date range, so that I can review past collections.

#### Acceptance Criteria

1. THE Payment_History_Page SHALL allow the collector to select a start date and end date for filtering, defaulting the start date to 30 days before the current date and the end date to the current date on page load
2. WHEN a date range is selected, THE Payment_History_Page SHALL display all Payment_Records with a payment date on or after the start date and on or before the end date, sorted by payment date in descending order
3. FOR EACH Payment_Record displayed, THE Payment_History_Page SHALL show the payment date, Client Name, and amount collected
4. IF the collector selects a start date that is after the end date, THEN THE Payment_History_Page SHALL display a validation error and prevent filtering
5. IF no Payment_Records exist within the selected date range, THEN THE Payment_History_Page SHALL display a message indicating no records were found

### Requirement 9: Collection Reports

**User Story:** As a collector, I want to view aggregated reports of collections, so that I can understand my collection performance.

#### Acceptance Criteria

1. THE Reports_Page SHALL provide a date range selector allowing the collector to specify a start date and end date, defaulting to the current month (first day of the current month as start date and today as end date)
2. THE Reports_Page SHALL provide a day-wise report displaying each date within the selected range alongside the total amount collected on that date, sorted in reverse chronological order (most recent date first)
3. THE Reports_Page SHALL provide a client-wise report displaying each Client Name alongside the total amount collected from that client within the selected range, sorted alphabetically by Client Name
4. WHEN a date range is selected, THE Reports_Page SHALL filter both day-wise and client-wise report data to only include Payment_Records with a payment date falling within the selected start and end dates (inclusive)
5. IF no Payment_Records exist within the selected date range, THEN THE Reports_Page SHALL display a message indicating no collection data is available for the selected period
6. THE Reports_Page SHALL display a Print button that is visible regardless of which report view (day-wise or client-wise) is currently active
7. WHEN the collector taps the Print button, THE Reports_Page SHALL invoke the browser native print dialog with a print-optimized layout containing the AppName, the selected date range (start date and end date), and the currently visible report data (day-wise or client-wise, whichever is active)
8. WHILE the print layout is rendered, THE Reports_Page SHALL hide all navigation elements, buttons, and date selectors from the printed output so that only the AppName header, date range, and report table are printed

### Requirement 10: AppName Display Across Application

**User Story:** As a collector, I want the configured application name displayed throughout the app, so that the app reflects my business identity.

#### Acceptance Criteria

1. THE App SHALL display the configured AppName in the page header on every screen
2. THE App SHALL use the configured AppName in the HTML document title on every page
3. WHEN no AppName has been configured in Local_Storage, THE App SHALL use the default value "ABC Debt Collection" for all display locations
4. WHEN the AppName value is updated in settings, THE App SHALL reflect the updated AppName in all page headers and document titles without requiring the user to reload or relaunch the application
5. THE App SHALL use the configured AppName as the payee name parameter in all generated UPI payment links

### Requirement 11: Offline Data Persistence

**User Story:** As a collector, I want all data stored locally on my device, so that the app works without an internet connection.

#### Acceptance Criteria

1. THE App SHALL store all Client_Records in Local_Storage using IndexedDB and SHALL persist them across browser sessions and device restarts
2. THE App SHALL store all Payment_Records in Local_Storage using IndexedDB and SHALL persist them across browser sessions and device restarts
3. THE App SHALL store UPI settings and AppName in Local_Storage and SHALL persist them across browser sessions and device restarts
4. WHILE the device is offline, THE App SHALL support create, read, update, and delete operations on Client_Records, Payment_Records, and settings with no loss of data
5. IF a storage write operation fails due to insufficient storage quota, THEN THE App SHALL display an error message indicating that device storage is full and SHALL preserve any previously saved data without corruption

### Requirement 12: PWA Installation and Offline Access

**User Story:** As a collector, I want to install the app on my mobile device and use it offline, so that I can collect payments without relying on network connectivity.

#### Acceptance Criteria

1. THE App SHALL provide a web app manifest that includes at minimum: name set to the configured AppName value, short_name set to the configured AppName value, start_url, display mode set to "standalone", at least one icon of 192x192 pixels, and at least one icon of 512x512 pixels
2. THE App SHALL register a service worker that pre-caches all HTML, CSS, JavaScript, and image assets required to render and operate the application during the service worker install event
3. WHEN the app is launched without network connectivity, THE App SHALL load the cached application shell and allow the user to perform all collection operations using locally stored data
4. IF the service worker fails to cache one or more required assets during installation, THEN THE App SHALL retry caching on the next page load and SHALL not activate the incomplete cache for offline use
5. WHEN the app detects that a new version of cached assets is available, THE App SHALL update the cache and notify the user that a new version is ready to activate upon next launch

### Requirement 13: Data Validation

**User Story:** As a collector, I want the app to validate my inputs, so that I do not accidentally save incorrect data.

#### Acceptance Criteria

1. WHEN the collector submits a Client_Record with an empty or whitespace-only Client Name, THE Client_Master SHALL display a validation error adjacent to the Client Name field and prevent saving
2. WHEN the collector submits a Client_Record with a total borrowed amount of zero or negative value, THE Client_Master SHALL display a validation error adjacent to the amount field and prevent saving
3. WHEN the collector submits a Client_Record with a duration of zero or negative value, THE Client_Master SHALL display a validation error adjacent to the duration field and prevent saving
4. WHEN the collector enters a non-numeric value or a value that is not exactly 10 digits in the mobile number field, THE Client_Master SHALL display a validation error adjacent to the mobile number field and prevent saving
5. IF the collector attempts to save a Client_Record with a duplicate Client Name (case-insensitive, trimmed), THEN THE Client_Master SHALL display an error indicating the name already exists
6. WHEN a validation error occurs, THE Client_Master SHALL preserve all form data entered by the collector without clearing any fields
