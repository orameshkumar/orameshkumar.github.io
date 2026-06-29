/**
 * clients.js - Clients Module for BuildCalc
 *
 * Manages client records with add/edit forms and list display.
 * Provides CRUD operations and client total aggregation.
 *
 * Dependencies: db.js
 */
'use strict';

const Clients = (function () {
  // ─── DOM References ──────────────────────────────────────────────────────

  var listContainer;
  var formOverlay;
  var formTitle;
  var form;
  var nameInput;
  var addressInput;
  var mobileInput;
  var idInput;
  var nameError;
  var btnAdd;
  var btnCancel;

  // ─── Initialization ──────────────────────────────────────────────────────

  function init() {
    listContainer = document.getElementById('clients-list');
    formOverlay = document.getElementById('client-form-overlay');
    formTitle = document.getElementById('client-form-title');
    form = document.getElementById('client-form');
    nameInput = document.getElementById('client-name');
    addressInput = document.getElementById('client-address');
    mobileInput = document.getElementById('client-mobile');
    idInput = document.getElementById('client-id');
    nameError = document.getElementById('client-name-error');
    btnAdd = document.getElementById('btn-add-client');
    btnCancel = document.getElementById('btn-cancel-client');
    console.log('[Clients.init] btnAdd =', btnAdd);
    console.log('[Clients.init] formOverlay =', formOverlay);

    // Bind events
    btnAdd.addEventListener('click', showAddForm);
    console.log('[Clients.init] click listener bound to btnAdd');
    form.addEventListener('submit', save);
    btnCancel.addEventListener('click', closeModal);

    // Close modal on overlay click
    formOverlay.addEventListener('click', function (e) {
      if (e.target === formOverlay) {
        closeModal();
      }
    });

    // Initial render
    renderList();
  }

  // ─── Render Client List ──────────────────────────────────────────────────

  function renderList() {
    return DB.getAllClients().then(function (clients) {
      // Sort by name case-insensitive
      clients.sort(function (a, b) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      if (clients.length === 0) {
        listContainer.innerHTML =
          '<div class="empty-state" aria-hidden="false">' +
          '<p>No clients yet. Tap "Add Client" to get started.</p>' +
          '</div>';
        return;
      }

      var html = '';
      var promises = [];

      clients.forEach(function (client) {
        promises.push(
          getClientTotal(client.id).then(function (total) {
            return { client: client, total: total };
          })
        );
      });

      return Promise.all(promises).then(function (results) {
        html = '';
        results.forEach(function (item) {
          var client = item.client;
          var total = item.total;
          var subtitle = [];
          if (client.address) subtitle.push(client.address);
          if (client.mobile) subtitle.push(client.mobile);

          html +=
            '<div class="list-item" data-id="' + client.id + '" tabindex="0" role="button" aria-label="Edit ' + escapeHtml(client.name) + '">' +
            '<div class="list-item-content">' +
            '<div class="list-item-title">' + escapeHtml(client.name) + '</div>' +
            '<div class="list-item-subtitle">' + escapeHtml(subtitle.join(' · ')) + '</div>' +
            '</div>' +
            '<div class="list-item-meta">' +
            '<span class="list-item-total">' + total + ' bags</span>' +
            '<button class="btn-icon btn-delete-client" data-id="' + client.id + '" aria-label="Delete ' + escapeHtml(client.name) + '" title="Delete">🗑️</button>' +
            '</div>' +
            '</div>';
        });

        listContainer.innerHTML = html;

        // Bind click handlers for editing (on content area, not delete button)
        var items = listContainer.querySelectorAll('.list-item-content');
        items.forEach(function (item) {
          item.addEventListener('click', function () {
            var listItem = item.closest('.list-item');
            showEditForm(listItem.getAttribute('data-id'));
          });
        });

        // Bind delete buttons
        listContainer.querySelectorAll('.btn-delete-client').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var id = btn.getAttribute('data-id');
            if (confirm('Delete this client and all their projects and estimates?')) {
              // Delete client + all associated projects + estimates
              DB.getProjectsByClient(id).then(function (projects) {
                var promises = [];
                projects.forEach(function (project) {
                  promises.push(
                    DB.getEstimatesByProject(project.id).then(function (estimates) {
                      return Promise.all(estimates.map(function (est) { return DB.deleteEstimate(est.id); }));
                    }).then(function () {
                      return DB.deleteProject(project.id);
                    })
                  );
                });
                return Promise.all(promises);
              }).then(function () {
                return DB.deleteClient(id);
              }).then(function () {
                renderList();
                showToast('Client deleted');
              });
            }
          });
        });
      });
    });
  }

  // ─── Show Add Form ───────────────────────────────────────────────────────

  function showAddForm() {
    formTitle.textContent = 'Add Client';
    form.reset();
    idInput.value = '';
    clearValidation();
    formOverlay.hidden = false;
    nameInput.focus();
  }

  // ─── Show Edit Form ──────────────────────────────────────────────────────

  function showEditForm(id) {
    return DB.getClient(id).then(function (client) {
      if (!client) return;

      formTitle.textContent = 'Edit Client';
      idInput.value = client.id;
      nameInput.value = client.name || '';
      addressInput.value = client.address || '';
      mobileInput.value = client.mobile || '';
      clearValidation();
      formOverlay.hidden = false;
      nameInput.focus();
    });
  }

  // ─── Save Client ────────────────────────────────────────────────────────

  function save(e) {
    e.preventDefault();
    clearValidation();

    var name = nameInput.value.trim();
    if (!name) {
      nameError.textContent = 'Client name is required';
      nameInput.focus();
      return;
    }

    var clientData = {
      name: name,
      address: addressInput.value.trim(),
      mobile: mobileInput.value.trim()
    };

    var existingId = idInput.value;

    if (existingId) {
      // Edit existing — no license check needed
      clientData.id = existingId;
      DB.getClient(existingId).then(function (existing) {
        clientData.createdAt = existing.createdAt;
        return DB.updateClient(clientData);
      }).then(function () {
        closeModal();
        renderList();
        showToast('Client updated');
      });
    } else {
      // New client — check license limit
      License.canAddClient().then(function (allowed) {
        if (!allowed) return;
        DB.addClient(clientData).then(function () {
          closeModal();
          renderList();
          showToast('Client added');
        });
      });
    }
  }

  // ─── Get Client Total ────────────────────────────────────────────────────

  function getClientTotal(id) {
    return DB.getProjectsByClient(id).then(function (projects) {
      if (projects.length === 0) return 0;

      var promises = projects.map(function (project) {
        return DB.getEstimatesByProject(project.id);
      });

      return Promise.all(promises).then(function (estimateArrays) {
        var totalBags = 0;
        estimateArrays.forEach(function (estimates) {
          estimates.forEach(function (est) {
            if (est.materialResults && est.materialResults.cementBags) {
              totalBags += est.materialResults.cementBags;
            }
          });
        });
        return Math.round(totalBags * 100) / 100;
      });
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function closeModal() {
    formOverlay.hidden = true;
  }

  function clearValidation() {
    nameError.textContent = '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(message) {
    var toast = document.getElementById('toast');
    var toastMsg = document.getElementById('toast-message');
    if (toast && toastMsg) {
      toastMsg.textContent = message;
      toast.hidden = false;
      setTimeout(function () { toast.hidden = true; }, 3000);
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    init: init,
    renderList: renderList,
    showAddForm: showAddForm,
    showEditForm: showEditForm,
    save: save,
    getClientTotal: getClientTotal
  };
})();
