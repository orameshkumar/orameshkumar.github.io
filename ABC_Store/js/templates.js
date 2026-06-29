/**
 * templates.js - Bill Templates Module for ABC Provisional Store
 *
 * Handles:
 *   - Template CRUD operations (create, read, update, delete)
 *   - Template validation (name length, items count, quantity range)
 *   - Template application to active bill (task 3.7)
 *   - Repeat last bill functionality (task 3.10)
 *   - Template manager UI in settings (task 3.4)
 *   - Template selection list in billing (task 3.5)
 *
 * Depends on: DB (db.js), Utils (utils.js)
 */

const Templates = (function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  var MAX_NAME_LENGTH = 50;
  var MIN_NAME_LENGTH = 1;
  var MAX_ITEMS = 50;
  var MIN_ITEMS = 1;
  var MIN_QUANTITY = 0.01;
  var MAX_QUANTITY = 99999;

  // ─── Initialization ─────────────────────────────────────────────────────────

  /**
   * Initialize the Templates module.
   * Renders the template manager UI in the settings screen.
   */
  function init() {
    renderTemplateManager();
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validate template name and items.
   * Returns an errors object if invalid, or null if valid.
   *
   * @param {string} name - Template name
   * @param {Array} items - Array of item entries with quantity fields
   * @returns {Object|null} Errors object with field-specific messages, or null if valid
   */
  function validateTemplate(name, items) {
    var errors = {};

    // Validate name
    var trimmedName = (name || '').trim();
    if (!trimmedName || trimmedName.length < MIN_NAME_LENGTH) {
      errors.name = 'Template name is required';
    } else if (trimmedName.length > MAX_NAME_LENGTH) {
      errors.name = 'Template name must be ' + MAX_NAME_LENGTH + ' characters or less';
    }

    // Validate items array
    if (!items || !Array.isArray(items) || items.length < MIN_ITEMS) {
      errors.items = 'At least one item is required';
    } else if (items.length > MAX_ITEMS) {
      errors.items = 'Maximum ' + MAX_ITEMS + ' items allowed per template';
    } else {
      // Validate each item's quantity
      var itemErrors = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var qty = item.defaultQuantityGrams;
        if (qty === undefined || qty === null || isNaN(qty) || qty < MIN_QUANTITY || qty > MAX_QUANTITY) {
          itemErrors.push({
            index: i,
            message: 'Quantity must be between ' + MIN_QUANTITY + ' and ' + MAX_QUANTITY
          });
        }
      }
      if (itemErrors.length > 0) {
        errors.itemErrors = itemErrors;
      }
    }

    // Return null if no errors, otherwise return errors object
    return Object.keys(errors).length === 0 ? null : errors;
  }

  // ─── CRUD Operations ────────────────────────────────────────────────────────

  /**
   * Save a new template to IndexedDB.
   * Validates name and items before persisting.
   *
   * @param {Object} template - Template object with name and items array
   * @param {string} template.name - Template name (1-50 chars)
   * @param {Array} template.items - Array of {itemId, itemName, defaultQuantityGrams, baseUnit}
   * @returns {Promise<Object>} Resolves with the saved template object
   * @throws {Error} If validation fails
   */
  async function saveTemplate(template) {
    var name = (template.name || '').trim();
    var items = template.items || [];

    // Validate
    var errors = validateTemplate(name, items);
    if (errors) {
      var error = new Error('Template validation failed');
      error.validationErrors = errors;
      throw error;
    }

    var now = new Date().toISOString();
    var templateToSave = {
      id: Utils.generateId(),
      name: name,
      items: items,
      createdAt: now,
      updatedAt: now
    };

    await DB.addTemplate(templateToSave);
    return templateToSave;
  }

  /**
   * Get a single template by its id.
   *
   * @param {string} id - The template id
   * @returns {Promise<Object|undefined>} The template object or undefined
   */
  function getTemplate(id) {
    return DB.getTemplate(id);
  }

  /**
   * Get all templates from IndexedDB.
   *
   * @returns {Promise<Object[]>} Array of all template objects
   */
  function getAllTemplates() {
    return DB.getAllTemplates();
  }

  /**
   * Delete a template by its id.
   *
   * @param {string} id - The template id to delete
   * @returns {Promise<undefined>}
   */
  function deleteTemplate(id) {
    return DB.deleteTemplate(id);
  }

  /**
   * Update an existing template in IndexedDB.
   * Validates name and items before persisting.
   *
   * @param {Object} template - Template object with id, name, and items
   * @param {string} template.id - Existing template id
   * @param {string} template.name - Template name (1-50 chars)
   * @param {Array} template.items - Array of {itemId, itemName, defaultQuantityGrams, baseUnit}
   * @returns {Promise<Object>} Resolves with the updated template object
   * @throws {Error} If validation fails or id is missing
   */
  async function updateTemplate(template) {
    if (!template.id) {
      throw new Error('Template id is required for update');
    }

    var name = (template.name || '').trim();
    var items = template.items || [];

    // Validate
    var errors = validateTemplate(name, items);
    if (errors) {
      var error = new Error('Template validation failed');
      error.validationErrors = errors;
      throw error;
    }

    var now = new Date().toISOString();
    var templateToUpdate = {
      id: template.id,
      name: name,
      items: items,
      createdAt: template.createdAt || now,
      updatedAt: now
    };

    await DB.updateTemplate(templateToUpdate);
    return templateToUpdate;
  }

  // ─── Stubs (to be implemented in later tasks) ──────────────────────────────

  /**
   * Apply a template to the active bill.
   * Retrieves the template, resolves current item prices, adds valid items
   * to the active bill via Billing.addItemById, and reports skipped items.
   *
   * @param {string} templateId - The template id to apply
   * @returns {Promise<Object>} Result with { added: number, skipped: string[] }
   */
  async function applyTemplate(templateId) {
    // 1. Retrieve the template
    var template = await DB.getTemplate(templateId);
    if (!template || !template.items || template.items.length === 0) {
      return { added: 0, skipped: [] };
    }

    // 2. Get all current items to resolve existence and current prices
    var currentItems = await DB.getAllItems();
    var itemMap = {};
    for (var i = 0; i < currentItems.length; i++) {
      itemMap[currentItems[i].id] = currentItems[i];
    }

    // 3. Resolve each template item against current catalog
    var added = 0;
    var skipped = [];

    for (var j = 0; j < template.items.length; j++) {
      var templateItem = template.items[j];
      var catalogItem = itemMap[templateItem.itemId];

      if (!catalogItem) {
        // Item no longer exists in catalog — skip it
        skipped.push(templateItem.itemName);
      } else {
        // 4. Add valid item to the active bill via Billing module
        await Billing.addItemById(catalogItem.id, templateItem.defaultQuantityGrams);
        added++;
      }
    }

    // 5. Show notifications for skipped items
    if (skipped.length > 0 && added > 0) {
      // Some items were skipped but others were added
      alert('Some items were skipped (no longer in catalog):\n' + skipped.join(', '));
    } else if (skipped.length > 0 && added === 0) {
      // 6. ALL items were skipped — notify and don't modify bill
      alert('No items could be added. All template items have been removed from the catalog:\n' + skipped.join(', '));
    }

    // 7. Return result
    return { added: added, skipped: skipped };
  }

  /**
   * Repeat the most recently finalized bill.
   * Retrieves the most recent bill, resolves items at current prices,
   * and adds valid line items to the active bill.
   *
   * @returns {Promise<Object>} Result with { added: number, skipped: string[] }
   */
  async function repeatLastBill() {
    var result = { added: 0, skipped: [] };

    try {
      // Retrieve all bills (already sorted by date descending)
      var allBills = await DB.getAllBills();

      // Edge case: no previous bills exist
      if (!allBills || allBills.length === 0) {
        showNotification('No previous bills found', 4000);
        return result;
      }

      // Pick the most recent bill (first in the sorted list)
      var lastBill = allBills[0];

      // Edge case: last bill has no line items
      if (!lastBill.lineItems || lastBill.lineItems.length === 0) {
        showNotification('No previous bills found', 4000);
        return result;
      }

      // Get all current items to resolve current prices
      var allItems = await DB.getAllItems();
      var itemMap = {};
      for (var i = 0; i < allItems.length; i++) {
        itemMap[allItems[i].id] = allItems[i];
      }

      // Process each line item from the last bill
      for (var j = 0; j < lastBill.lineItems.length; j++) {
        var lineItem = lastBill.lineItems[j];
        var currentItem = itemMap[lineItem.itemId];

        if (currentItem) {
          // Item exists — add to active bill at current price using Billing.addItemById
          await Billing.addItemById(currentItem.id, lineItem.quantityGrams);
          result.added++;
        } else {
          // Item no longer exists — add to skipped list
          result.skipped.push(lineItem.itemName || 'Unknown Item');
        }
      }

      // Show appropriate notifications
      if (result.added === 0 && result.skipped.length > 0) {
        // All items were skipped
        showNotification('No items could be added. Deleted items: ' + result.skipped.join(', '), 5000);
      } else if (result.skipped.length > 0) {
        // Some items were skipped
        showNotification('Some items were skipped (deleted): ' + result.skipped.join(', '), 5000);
      }

    } catch (e) {
      console.error('Templates.repeatLastBill: Failed', e);
      showNotification('Error retrieving last bill. Please try again.', 4000);
    }

    return result;
  }

  /**
   * Show a toast notification message.
   * @param {string} message - The message to display
   * @param {number} duration - Duration in ms before auto-removal (default 3000)
   */
  function showNotification(message, duration) {
    duration = duration || 3000;

    // Remove existing notification if present
    var existing = document.querySelector('.template-notification');
    if (existing) {
      existing.remove();
    }

    var toast = document.createElement('div');
    toast.className = 'template-notification';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'
      + 'background:#333;color:#fff;padding:12px 20px;border-radius:8px;'
      + 'z-index:9999;max-width:90%;text-align:center;font-size:14px;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    document.body.appendChild(toast);

    // Auto-remove after duration
    setTimeout(function () {
      if (toast.parentNode) {
        toast.remove();
      }
    }, duration);
  }

  /**
   * Show the template selection list in billing screen.
   * Displays a modal popup with all templates sorted alphabetically.
   * User can tap a template to apply it to the active bill, or close the modal.
   */
  async function showTemplateList() {
    // Remove any existing template list modal
    _removeTemplateListModal();

    // Load all templates
    var templates = [];
    try {
      templates = await DB.getAllTemplates();
    } catch (e) {
      console.error('Templates: Failed to load templates for list', e);
    }

    // Sort alphabetically by name (case-insensitive)
    templates.sort(function (a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    // Build modal
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'template-list-overlay';

    var bodyHtml = '';
    if (templates.length === 0) {
      bodyHtml = '<p style="text-align:center;color:var(--color-text-secondary);padding:24px 12px;font-size:0.875rem;">No templates available. Create templates in Settings.</p>';
    } else {
      bodyHtml = '<div id="template-list-items" style="display:flex;flex-direction:column;gap:4px;max-height:60vh;overflow-y:auto;padding:4px 0;">';
      for (var i = 0; i < templates.length; i++) {
        var tmpl = templates[i];
        bodyHtml +=
          '<button class="template-list-row" data-template-id="' + tmpl.id + '" style="'
            + 'display:flex;align-items:center;width:100%;padding:12px 16px;border:1px solid var(--color-border);'
            + 'border-radius:8px;background:var(--color-surface);cursor:pointer;text-align:left;'
            + 'font-size:0.875rem;color:var(--color-text);transition:background 0.15s;'
          + '">'
            + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _escapeHtml(tmpl.name) + '</span>'
            + '<span style="font-size:0.7rem;color:var(--color-text-secondary);margin-left:8px;">' + tmpl.items.length + ' item' + (tmpl.items.length !== 1 ? 's' : '') + '</span>'
          + '</button>';
      }
      bodyHtml += '</div>';
    }

    overlay.innerHTML =
      '<div class="modal" role="dialog" aria-labelledby="template-list-modal-title" aria-modal="true">' +
        '<div class="modal-header">' +
          '<h2 class="modal-title" id="template-list-modal-title">Select Template</h2>' +
          '<button class="modal-close" id="template-list-modal-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="modal-body">' +
          bodyHtml +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn-secondary" id="template-list-modal-cancel">Cancel</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Activate modal with animation
    requestAnimationFrame(function () {
      overlay.classList.add('active');
    });

    // Attach close/cancel listeners
    var closeBtn = document.getElementById('template-list-modal-close');
    var cancelBtn = document.getElementById('template-list-modal-cancel');

    if (closeBtn) closeBtn.addEventListener('click', _closeTemplateListModal);
    if (cancelBtn) cancelBtn.addEventListener('click', _closeTemplateListModal);

    // Close on overlay background click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closeTemplateListModal();
    });

    // Attach template row click listeners
    var rows = overlay.querySelectorAll('.template-list-row');
    rows.forEach(function (row) {
      row.addEventListener('click', function () {
        var templateId = row.getAttribute('data-template-id');
        _closeTemplateListModal();
        // Apply the selected template after closing
        applyTemplate(templateId);
      });
    });
  }

  /**
   * Close and remove the template list modal with animation.
   */
  function _closeTemplateListModal() {
    var overlay = document.getElementById('template-list-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(function () {
        _removeTemplateListModal();
      }, 300);
    }
  }

  /**
   * Remove the template list modal element from DOM.
   */
  function _removeTemplateListModal() {
    var existing = document.getElementById('template-list-overlay');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  // ─── Template Manager UI (Task 3.4) ────────────────────────────────────────

  /**
   * Render the "Bill Templates" section in the Settings screen.
   * Injects a section below the existing settings form with:
   *   - Section header "Bill Templates"
   *   - "Add Template" button
   *   - List of existing templates with edit/delete buttons
   */
  async function renderTemplateManager() {
    var settingsScreen = document.getElementById('settings-screen');
    if (!settingsScreen) return;

    var screenContent = settingsScreen.querySelector('.screen-content');
    if (!screenContent) return;

    // Remove existing template section if present
    var existing = document.getElementById('template-manager-section');
    if (existing) existing.remove();

    var section = document.createElement('div');
    section.id = 'template-manager-section';
    section.style.cssText = 'margin-top:24px;';

    // Build header and add button
    var headerHtml = '<h2 class="section-heading" style="margin-bottom:12px;">Bill Templates</h2>';
    headerHtml += '<button id="add-template-btn" class="btn-primary" style="width:100%;margin-bottom:12px;">+ Add Template</button>';

    section.innerHTML = headerHtml + '<div id="template-list" style="display:flex;flex-direction:column;gap:8px;"></div>';

    // Append to settings form area (below existing content)
    var settingsForm = screenContent.querySelector('.settings-form');
    if (settingsForm) {
      settingsForm.appendChild(section);
    } else {
      screenContent.appendChild(section);
    }

    // Load and render template list
    await _refreshTemplateList();

    // Attach "Add Template" button listener
    var addBtn = document.getElementById('add-template-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openTemplateForm(null);
      });
    }
  }

  /**
   * Refresh the template list display in the settings screen.
   * Called after add/edit/delete operations.
   */
  async function _refreshTemplateList() {
    var listContainer = document.getElementById('template-list');
    if (!listContainer) return;

    var templates = [];
    try {
      templates = await DB.getAllTemplates();
    } catch (e) {
      console.error('Templates: Failed to load templates', e);
    }

    if (templates.length === 0) {
      listContainer.innerHTML = '<p style="text-align:center;color:var(--color-text-secondary);font-size:0.8rem;padding:12px 0;">No templates created yet.</p>';
      return;
    }

    // Sort alphabetically by name
    templates.sort(function (a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    var html = '';
    templates.forEach(function (tmpl) {
      html +=
        '<div class="item-card" data-template-id="' + tmpl.id + '" style="padding:10px 12px;">' +
          '<div class="item-info" style="flex:1;min-width:0;">' +
            '<div class="item-name" style="font-size:0.875rem;">' + _escapeHtml(tmpl.name) + '</div>' +
            '<div style="font-size:0.7rem;color:var(--color-text-secondary);">' + tmpl.items.length + ' item' + (tmpl.items.length !== 1 ? 's' : '') + '</div>' +
          '</div>' +
          '<button class="item-edit-btn template-edit-btn" data-template-id="' + tmpl.id + '" aria-label="Edit ' + _escapeHtml(tmpl.name) + '" style="min-width:36px;min-height:36px;">&#9998;</button>' +
          '<button class="item-delete-btn template-delete-btn" data-template-id="' + tmpl.id + '" aria-label="Delete ' + _escapeHtml(tmpl.name) + '" style="min-width:36px;min-height:36px;">&#128465;</button>' +
        '</div>';
    });

    listContainer.innerHTML = html;

    // Attach edit listeners
    var editBtns = listContainer.querySelectorAll('.template-edit-btn');
    editBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.getAttribute('data-template-id');
        var tmpl = templates.find(function (t) { return t.id === id; });
        if (tmpl) openTemplateForm(tmpl);
      });
    });

    // Attach delete listeners
    var deleteBtns = listContainer.querySelectorAll('.template-delete-btn');
    deleteBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.getAttribute('data-template-id');
        var tmpl = templates.find(function (t) { return t.id === id; });
        if (tmpl) _handleDeleteTemplate(tmpl);
      });
    });
  }

  /**
   * Handle template deletion with confirmation prompt.
   * @param {Object} template - The template to delete
   */
  async function _handleDeleteTemplate(template) {
    var confirmed = confirm('Delete template "' + template.name + '"? This cannot be undone.');
    if (!confirmed) return;

    try {
      await deleteTemplate(template.id);
      await _refreshTemplateList();
    } catch (e) {
      console.error('Templates: Failed to delete template', e);
      alert('Failed to delete template. Please try again.');
    }
  }

  // ─── Template Form (Modal) ─────────────────────────────────────────────────

  /**
   * Open the template add/edit form as a modal overlay.
   * Contains: name input (max 50 chars), item list editor with dropdowns,
   * quantity inputs, unit display, add/remove row buttons, save/cancel.
   *
   * @param {Object|null} template - Existing template to edit, or null for new
   */
  async function openTemplateForm(template) {
    // Remove any existing template form modal
    _removeTemplateModal();

    // Load all items from catalog for the dropdown
    var allItems = [];
    try {
      allItems = await DB.getAllItems();
    } catch (e) {
      console.error('Templates: Failed to load items for form', e);
    }

    var isEditing = !!template;
    var title = isEditing ? 'Edit Template' : 'Add Template';
    var nameVal = isEditing ? _escapeAttr(template.name) : '';

    // Build the modal
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'template-form-overlay';

    overlay.innerHTML =
      '<div class="modal" role="dialog" aria-labelledby="template-modal-title" aria-modal="true">' +
        '<div class="modal-header">' +
          '<h2 class="modal-title" id="template-modal-title">' + title + '</h2>' +
          '<button class="modal-close" id="template-modal-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div class="form-group">' +
            '<label for="template-name-input">Template Name *</label>' +
            '<input type="text" id="template-name-input" placeholder="Enter template name" value="' + nameVal + '" maxlength="50" autocomplete="off">' +
            '<span id="template-name-error" style="color:var(--color-danger);font-size:0.75rem;display:none;margin-top:4px;"></span>' +
          '</div>' +
          '<div class="form-group">' +
            '<label>Items *</label>' +
            '<span id="template-items-error" style="color:var(--color-danger);font-size:0.75rem;display:none;margin-top:4px;"></span>' +
            '<div id="template-items-list" style="display:flex;flex-direction:column;gap:8px;margin-top:8px;"></div>' +
            '<button type="button" id="template-add-item-btn" class="btn-secondary" style="width:100%;margin-top:8px;font-size:0.8rem;min-height:36px;">+ Add Item</button>' +
          '</div>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn-secondary" id="template-modal-cancel">Cancel</button>' +
          '<button class="btn-primary" id="template-modal-save">Save</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Activate modal with animation
    requestAnimationFrame(function () {
      overlay.classList.add('active');
    });

    // If editing, populate existing items
    if (isEditing && template.items && template.items.length > 0) {
      template.items.forEach(function (item) {
        _addTemplateItemRow(item, allItems);
      });
    }

    // Attach event listeners
    _setupTemplateFormListeners(overlay, allItems, template);

    // Focus name input
    setTimeout(function () {
      var nameInput = document.getElementById('template-name-input');
      if (nameInput) nameInput.focus();
    }, 350);
  }

  /**
   * Set up event listeners for the template form modal.
   * @param {HTMLElement} overlay - The modal overlay element
   * @param {Array} allItems - All items from catalog
   * @param {Object|null} template - Template being edited or null
   */
  function _setupTemplateFormListeners(overlay, allItems, template) {
    var closeBtn = document.getElementById('template-modal-close');
    var cancelBtn = document.getElementById('template-modal-cancel');
    var saveBtn = document.getElementById('template-modal-save');
    var addItemBtn = document.getElementById('template-add-item-btn');

    if (closeBtn) closeBtn.addEventListener('click', _closeTemplateModal);
    if (cancelBtn) cancelBtn.addEventListener('click', _closeTemplateModal);
    if (saveBtn) saveBtn.addEventListener('click', function () { _handleTemplateSave(template); });
    if (addItemBtn) addItemBtn.addEventListener('click', function () { _addTemplateItemRow(null, allItems); });

    // Close on overlay background click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closeTemplateModal();
    });
  }

  /**
   * Add an item row to the template items list editor.
   * @param {Object|null} existingItem - Existing item data or null for new row
   * @param {Array} allItems - All items from the Item_Master catalog
   */
  function _addTemplateItemRow(existingItem, allItems) {
    var listContainer = document.getElementById('template-items-list');
    if (!listContainer) return;

    var row = document.createElement('div');
    row.className = 'template-item-row';
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);';

    // Build item dropdown options
    var optionsHtml = '<option value="">-- Select Item --</option>';
    var itemAvailable = true;

    allItems.forEach(function (item) {
      var selected = (existingItem && existingItem.itemId === item.id) ? ' selected' : '';
      optionsHtml += '<option value="' + item.id + '" data-unit="' + (item.baseUnit || 'kg') + '"' + selected + '>' + _escapeHtml(item.name) + '</option>';
    });

    // Check if existing item is no longer in catalog (deleted/unavailable)
    if (existingItem && existingItem.itemId) {
      var found = allItems.find(function (i) { return i.id === existingItem.itemId; });
      if (!found) {
        itemAvailable = false;
        optionsHtml += '<option value="' + existingItem.itemId + '" selected disabled>' + _escapeHtml(existingItem.itemName) + ' (unavailable)</option>';
      }
    }

    var qtyVal = existingItem ? existingItem.defaultQuantityGrams : '';
    var unitLabel = '';
    if (existingItem && existingItem.baseUnit) {
      unitLabel = _getUnitLabel(existingItem.baseUnit);
    }

    var selectStyle = 'width:100%;padding:8px;border:1.5px solid var(--color-border);border-radius:8px;font-size:0.8rem;min-height:36px;background:var(--color-surface);color:var(--color-text);';
    if (!itemAvailable) {
      selectStyle += 'color:var(--color-danger);';
    }

    row.innerHTML =
      '<div style="flex:1;min-width:0;">' +
        '<select class="template-item-select" style="' + selectStyle + '">' +
          optionsHtml +
        '</select>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:4px;">' +
        '<input type="number" class="template-item-qty" placeholder="Qty" value="' + qtyVal + '" min="0.01" max="99999" step="0.01" style="width:70px;padding:8px;border:1.5px solid var(--color-border);border-radius:8px;font-size:0.8rem;min-height:36px;text-align:center;">' +
        '<span class="template-item-unit" style="font-size:0.7rem;color:var(--color-text-secondary);min-width:24px;">' + unitLabel + '</span>' +
      '</div>' +
      '<button type="button" class="template-remove-item-btn" aria-label="Remove item" style="width:32px;height:32px;border:none;background:rgba(234,67,53,0.1);color:var(--color-danger);border-radius:8px;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;justify-content:center;">&#10005;</button>';

    listContainer.appendChild(row);

    // Attach select change listener to update unit label
    var select = row.querySelector('.template-item-select');
    var unitSpan = row.querySelector('.template-item-unit');
    if (select) {
      select.addEventListener('change', function () {
        var selectedOption = select.options[select.selectedIndex];
        var unit = selectedOption ? selectedOption.getAttribute('data-unit') : '';
        if (unitSpan) unitSpan.textContent = unit ? _getUnitLabel(unit) : '';
      });
    }

    // Attach remove button listener
    var removeBtn = row.querySelector('.template-remove-item-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        row.remove();
      });
    }
  }

  /**
   * Handle saving the template form (create or update).
   * Validates input, calls saveTemplate() or updateTemplate() accordingly.
   * @param {Object|null} existingTemplate - Template being edited, or null for new
   */
  async function _handleTemplateSave(existingTemplate) {
    var nameInput = document.getElementById('template-name-input');
    var nameError = document.getElementById('template-name-error');
    var itemsError = document.getElementById('template-items-error');
    var itemsList = document.getElementById('template-items-list');

    // Hide previous errors
    if (nameError) { nameError.style.display = 'none'; nameError.textContent = ''; }
    if (itemsError) { itemsError.style.display = 'none'; itemsError.textContent = ''; }

    var name = nameInput ? nameInput.value.trim() : '';

    // Collect items from rows
    var items = [];
    var rows = itemsList ? itemsList.querySelectorAll('.template-item-row') : [];

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var select = row.querySelector('.template-item-select');
      var qtyInput = row.querySelector('.template-item-qty');

      var itemId = select ? select.value : '';
      var qty = qtyInput ? parseFloat(qtyInput.value) : NaN;

      if (!itemId) continue; // skip empty selections

      var selectedOption = select.options[select.selectedIndex];
      var itemName = selectedOption ? selectedOption.textContent.replace(' (unavailable)', '') : '';
      var baseUnit = selectedOption ? (selectedOption.getAttribute('data-unit') || 'kg') : 'kg';

      items.push({
        itemId: itemId,
        itemName: itemName,
        defaultQuantityGrams: qty,
        baseUnit: baseUnit
      });
    }

    // Validate using existing validation function
    var errors = validateTemplate(name, items);
    if (errors) {
      if (errors.name && nameError) {
        nameError.textContent = errors.name;
        nameError.style.display = 'block';
      }
      if (errors.items && itemsError) {
        itemsError.textContent = errors.items;
        itemsError.style.display = 'block';
      }
      if (errors.itemErrors && itemsError) {
        itemsError.textContent = 'One or more items have invalid quantities (must be between 0.01 and 99999)';
        itemsError.style.display = 'block';
      }
      return;
    }

    try {
      if (existingTemplate && existingTemplate.id) {
        // Update existing template
        await updateTemplate({
          id: existingTemplate.id,
          name: name,
          items: items,
          createdAt: existingTemplate.createdAt
        });
      } else {
        // Save new template
        await saveTemplate({
          name: name,
          items: items
        });
      }

      _closeTemplateModal();
      await _refreshTemplateList();
    } catch (e) {
      console.error('Templates: Failed to save template', e);
      if (e.validationErrors) {
        if (e.validationErrors.name && nameError) {
          nameError.textContent = e.validationErrors.name;
          nameError.style.display = 'block';
        }
        if ((e.validationErrors.items || e.validationErrors.itemErrors) && itemsError) {
          itemsError.textContent = e.validationErrors.items || 'One or more items have invalid quantities';
          itemsError.style.display = 'block';
        }
      } else {
        alert('Failed to save template. Please try again.');
      }
    }
  }

  /**
   * Close and remove the template form modal with animation.
   */
  function _closeTemplateModal() {
    var overlay = document.getElementById('template-form-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(function () {
        _removeTemplateModal();
      }, 300);
    }
  }

  /**
   * Remove the template modal element from DOM.
   */
  function _removeTemplateModal() {
    var existing = document.getElementById('template-form-overlay');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  // ─── UI Helpers ─────────────────────────────────────────────────────────────

  /**
   * Get display label for a base unit (used in template item rows).
   * @param {string} unit - 'kg', 'litre', or 'count'
   * @returns {string} Display label
   */
  function _getUnitLabel(unit) {
    if (unit === 'litre') return 'ml';
    if (unit === 'count') return 'nos';
    return 'g';
  }

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  function _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Escape string for use in HTML attribute values.
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  function _escapeAttr(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return {
    init: init,
    validateTemplate: validateTemplate,
    saveTemplate: saveTemplate,
    getTemplate: getTemplate,
    getAllTemplates: getAllTemplates,
    deleteTemplate: deleteTemplate,
    updateTemplate: updateTemplate,
    applyTemplate: applyTemplate,
    repeatLastBill: repeatLastBill,
    showTemplateList: showTemplateList,
    renderTemplateManager: renderTemplateManager,
    openTemplateForm: openTemplateForm
  };

})();
