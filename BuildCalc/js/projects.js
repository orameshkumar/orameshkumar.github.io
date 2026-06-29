/**
 * projects.js - Projects Module for BuildCalc
 *
 * Manages project records with client association, filtering, and list display.
 * Provides navigation to estimation screen with project context.
 *
 * Dependencies: db.js
 */
'use strict';

const Projects = (function () {
  // ─── DOM References ──────────────────────────────────────────────────────

  var listContainer;
  var formOverlay;
  var formTitle;
  var form;
  var nameInput;
  var clientSelect;
  var idInput;
  var nameError;
  var clientError;
  var btnAdd;
  var btnCancel;
  var clientFilter;

  // ─── Initialization ──────────────────────────────────────────────────────

  function init() {
    listContainer = document.getElementById('projects-list');
    formOverlay = document.getElementById('project-form-overlay');
    formTitle = document.getElementById('project-form-title');
    form = document.getElementById('project-form');
    nameInput = document.getElementById('project-name');
    clientSelect = document.getElementById('project-client-select');
    idInput = document.getElementById('project-id');
    nameError = document.getElementById('project-name-error');
    clientError = document.getElementById('project-client-error');
    btnAdd = document.getElementById('btn-add-project');
    btnCancel = document.getElementById('btn-cancel-project');
    clientFilter = document.getElementById('project-client-filter');

    // Bind events
    btnAdd.addEventListener('click', showAddForm);
    form.addEventListener('submit', save);
    btnCancel.addEventListener('click', closeModal);
    clientFilter.addEventListener('change', function () {
      renderList(clientFilter.value || null);
    });

    // Close modal on overlay click
    formOverlay.addEventListener('click', function (e) {
      if (e.target === formOverlay) {
        closeModal();
      }
    });

    // Populate filter dropdown and render list
    populateClientFilter();
    renderList();
  }

  // ─── Populate Client Filter ──────────────────────────────────────────────

  function populateClientFilter() {
    return DB.getAllClients().then(function (clients) {
      clients.sort(function (a, b) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      // Keep the "All Clients" option
      var html = '<option value="">All Clients</option>';
      clients.forEach(function (client) {
        html += '<option value="' + client.id + '">' + escapeHtml(client.name) + '</option>';
      });
      clientFilter.innerHTML = html;
    });
  }

  // ─── Render Project List ─────────────────────────────────────────────────

  function renderList(clientId) {
    var fetchProjects;
    if (clientId) {
      fetchProjects = DB.getProjectsByClient(clientId);
    } else {
      fetchProjects = DB.getAllProjects();
    }

    return fetchProjects.then(function (projects) {
      if (projects.length === 0) {
        listContainer.innerHTML =
          '<div class="empty-state" aria-hidden="false">' +
          '<p>No projects yet. Tap "Add Project" to get started.</p>' +
          '</div>';
        return;
      }

      // Sort by name case-insensitive
      projects.sort(function (a, b) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      // Get client names and project totals
      var promises = projects.map(function (project) {
        return Promise.all([
          DB.getClient(project.clientId),
          getProjectTotal(project.id)
        ]).then(function (results) {
          return { project: project, client: results[0], total: results[1] };
        });
      });

      return Promise.all(promises).then(function (results) {
        var html = '';
        results.forEach(function (item) {
          var project = item.project;
          var clientName = item.client ? item.client.name : 'Unknown';
          var total = item.total;

          html +=
            '<div class="list-item" data-id="' + project.id + '" tabindex="0" role="button" aria-label="Open ' + escapeHtml(project.name) + '">' +
            '<div class="list-item-content">' +
            '<div class="list-item-title">' + escapeHtml(project.name) + '</div>' +
            '<div class="list-item-subtitle">' + escapeHtml(clientName) + '</div>' +
            '</div>' +
            '<div class="list-item-meta">' +
            '<span class="list-item-total">' + total + ' bags</span>' +
            '<button class="btn-icon btn-delete-project" data-id="' + project.id + '" aria-label="Delete ' + escapeHtml(project.name) + '" title="Delete">🗑️</button>' +
            '</div>' +
            '</div>';
        });

        listContainer.innerHTML = html;

        // Bind click handlers for navigation to estimation (on content area)
        listContainer.querySelectorAll('.list-item-content').forEach(function (item) {
          item.addEventListener('click', function () {
            var listItem = item.closest('.list-item');
            var pid = listItem.getAttribute('data-id');
            // Set context on all modules without navigating away
            App.setProjectContext(pid);
            // Highlight active project in the list
            listContainer.querySelectorAll('.list-item').forEach(function(li) {
              li.classList.toggle('list-item-active', li.getAttribute('data-id') === pid);
            });
            // Show active project bar
            DB.getProject(pid).then(function(proj) {
              var bar  = document.getElementById('active-project-bar');
              var name = document.getElementById('active-project-name');
              if (bar && proj) { name.textContent = proj.name; bar.hidden = false; }
            });
          });
        });

        // Bind delete buttons
        listContainer.querySelectorAll('.btn-delete-project').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var id = btn.getAttribute('data-id');
            if (confirm('Delete this project and all its estimates?')) {
              DB.getEstimatesByProject(id).then(function (estimates) {
                return Promise.all(estimates.map(function (est) { return DB.deleteEstimate(est.id); }));
              }).then(function () {
                return DB.deleteProject(id);
              }).then(function () {
                renderList(clientFilter.value || null);
                showToast('Project deleted');
              });
            }
          });
        });
      });
    });
  }

  // ─── Show Add Form ───────────────────────────────────────────────────────

  function showAddForm() {
    formTitle.textContent = 'Add Project';
    form.reset();
    idInput.value = '';
    clearValidation();

    // Populate client dropdown
    DB.getAllClients().then(function (clients) {
      clients.sort(function (a, b) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      var html = '<option value="">Select a client</option>';
      clients.forEach(function (client) {
        html += '<option value="' + client.id + '">' + escapeHtml(client.name) + '</option>';
      });
      clientSelect.innerHTML = html;

      formOverlay.hidden = false;
      nameInput.focus();
    });
  }

  // ─── Save Project ───────────────────────────────────────────────────────

  function save(e) {
    e.preventDefault();
    clearValidation();

    var name = nameInput.value.trim();
    var selectedClientId = clientSelect.value;
    var valid = true;

    if (!name) {
      nameError.textContent = 'Project name is required';
      nameInput.focus();
      valid = false;
    }

    if (!selectedClientId) {
      clientError.textContent = 'Please select a client';
      if (valid) clientSelect.focus();
      valid = false;
    }

    if (!valid) return;

    var projectData = {
      name: name,
      clientId: selectedClientId
    };

    var existingId = idInput.value;
    var promise;

    if (existingId) {
      projectData.id = existingId;
      DB.getProject(existingId).then(function (existing) {
        projectData.createdAt = existing.createdAt;
        if (existing.configSnapshot) {
          projectData.configSnapshot = existing.configSnapshot;
        }
        return DB.updateProject(projectData);
      }).then(function () {
        closeModal();
        renderList(clientFilter.value || null);
        populateClientFilter();
        showToast('Project updated');
      });
    } else {
      // New project — check license limit per client
      License.canAddProject(selectedClientId).then(function (allowed) {
        console.log('[Projects.save] canAddProject allowed=', allowed);
        if (!allowed) return;
        projectData.configSnapshot = Config.createSnapshot();
        console.log('[Projects.save] calling DB.addProject', projectData);
        DB.addProject(projectData).then(function () {
          console.log('[Projects.save] addProject done, calling renderList');
          closeModal();
          renderList(clientFilter.value || null);
          populateClientFilter();
          showToast('Project added');
        });
      });
    }
  }

  // ─── Get Project Total ───────────────────────────────────────────────────

  function getProjectTotal(projectId) {
    return DB.getEstimatesByProject(projectId).then(function (estimates) {
      var totalBags = 0;
      estimates.forEach(function (est) {
        if (est.materialResults && est.materialResults.cementBags) {
          totalBags += est.materialResults.cementBags;
        }
      });
      return Math.round(totalBags * 100) / 100;
    });
  }

  // ─── Navigate to Estimation ──────────────────────────────────────────────

  function navigateToEstimation(projectId) {
    App.navigateTo('estimation-screen');
    Estimation.setProject(projectId);
    if (typeof CAD !== 'undefined')         CAD.setProject(projectId);
    if (typeof Schedule !== 'undefined')    Schedule.setProject(projectId);
    if (typeof Procurement !== 'undefined') Procurement.setProject(projectId);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function closeModal() {
    formOverlay.hidden = true;
  }

  function clearValidation() {
    nameError.textContent = '';
    clientError.textContent = '';
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
    save: save,
    getProjectTotal: getProjectTotal,
    navigateToEstimation: navigateToEstimation
  };
})();
