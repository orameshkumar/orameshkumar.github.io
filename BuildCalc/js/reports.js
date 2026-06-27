/**
 * reports.js - Reports Module for BuildCalc
 *
 * Generates material and labor reports across projects and clients.
 * Provides aggregation functions for material totals and labor totals.
 *
 * Dependencies: db.js
 */
'use strict';

const Reports = (function () {
  // ─── DOM References ──────────────────────────────────────────────────────

  var clientSelect;
  var projectSelect;
  var materialTotalsContent;
  var laborTotalsContent;

  // ─── Initialization ──────────────────────────────────────────────────────

  function init() {
    clientSelect = document.getElementById('report-client-select');
    projectSelect = document.getElementById('report-project-select');
    materialTotalsContent = document.getElementById('material-totals-content');
    laborTotalsContent = document.getElementById('labor-totals-content');

    // Bind select changes
    clientSelect.addEventListener('change', onClientChange);
    projectSelect.addEventListener('change', onProjectChange);

    // Populate dropdowns
    populateDropdowns();
  }

  // ─── Populate Dropdowns ──────────────────────────────────────────────────

  function populateDropdowns() {
    return DB.getAllClients().then(function (clients) {
      clients.sort(function (a, b) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      var clientHtml = '<option value="">All Clients</option>';
      clients.forEach(function (client) {
        clientHtml += '<option value="' + client.id + '">' + escapeHtml(client.name) + '</option>';
      });
      clientSelect.innerHTML = clientHtml;

      return populateProjectDropdown(null);
    });
  }

  function populateProjectDropdown(clientId) {
    var fetchProjects;
    if (clientId) {
      fetchProjects = DB.getProjectsByClient(clientId);
    } else {
      fetchProjects = DB.getAllProjects();
    }

    return fetchProjects.then(function (projects) {
      projects.sort(function (a, b) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      var html = '<option value="">All Projects</option>';
      projects.forEach(function (project) {
        html += '<option value="' + project.id + '">' + escapeHtml(project.name) + '</option>';
      });
      projectSelect.innerHTML = html;
    });
  }

  // ─── Event Handlers ──────────────────────────────────────────────────────

  function onClientChange() {
    var clientId = clientSelect.value;
    populateProjectDropdown(clientId || null).then(function () {
      if (clientId) {
        renderClientReport(clientId);
      } else {
        clearReport();
      }
    });
  }

  function onProjectChange() {
    var projectId = projectSelect.value;
    if (projectId) {
      renderProjectReport(projectId);
    } else {
      // If client is selected, show client report
      var clientId = clientSelect.value;
      if (clientId) {
        renderClientReport(clientId);
      } else {
        clearReport();
      }
    }
  }

  // ─── Render Project Report ───────────────────────────────────────────────

  function renderProjectReport(projectId) {
    return DB.getEstimatesByProject(projectId).then(function (estimates) {
      if (estimates.length === 0) {
        materialTotalsContent.innerHTML = '<div class="empty-state"><p>No estimates for this project.</p></div>';
        laborTotalsContent.innerHTML = '<div class="empty-state"><p>No labor data available.</p></div>';
        return;
      }

      var materials = aggregateMaterials(estimates);
      var labor = aggregateLabor(estimates);

      displayMaterials(materials);
      displayLabor(labor);
    });
  }

  // ─── Render Client Report ────────────────────────────────────────────────

  function renderClientReport(clientId) {
    return DB.getProjectsByClient(clientId).then(function (projects) {
      if (projects.length === 0) {
        materialTotalsContent.innerHTML = '<div class="empty-state"><p>No projects for this client.</p></div>';
        laborTotalsContent.innerHTML = '<div class="empty-state"><p>No labor data available.</p></div>';
        return;
      }

      var promises = projects.map(function (project) {
        return DB.getEstimatesByProject(project.id);
      });

      return Promise.all(promises).then(function (estimateArrays) {
        var allEstimates = [];
        estimateArrays.forEach(function (arr) {
          allEstimates = allEstimates.concat(arr);
        });

        if (allEstimates.length === 0) {
          materialTotalsContent.innerHTML = '<div class="empty-state"><p>No estimates for this client.</p></div>';
          laborTotalsContent.innerHTML = '<div class="empty-state"><p>No labor data available.</p></div>';
          return;
        }

        var materials = aggregateMaterials(allEstimates);
        var labor = aggregateLabor(allEstimates);

        displayMaterials(materials);
        displayLabor(labor);
      });
    });
  }

  // ─── Aggregate Materials ─────────────────────────────────────────────────

  function aggregateMaterials(estimates) {
    var totals = {
      cementBags: 0,
      sandVolume: 0,
      crushVolume: 0,
      blocks: 0,
      steelKg: 0,
      tileCount: 0
    };

    estimates.forEach(function (est) {
      if (!est.materialResults) return;
      var mr = est.materialResults;

      if (mr.cementBags) totals.cementBags += mr.cementBags;
      if (mr.sandVolume) totals.sandVolume += mr.sandVolume;
      if (mr.crushVolume) totals.crushVolume += mr.crushVolume;
      if (mr.blocks) totals.blocks += mr.blocks;
      if (mr.weightKg) totals.steelKg += mr.weightKg;
      if (mr.tileCount) totals.tileCount += mr.tileCount;
    });

    // Round all values
    totals.cementBags = round2(totals.cementBags);
    totals.sandVolume = round2(totals.sandVolume);
    totals.crushVolume = round2(totals.crushVolume);
    totals.blocks = round2(totals.blocks);
    totals.steelKg = round2(totals.steelKg);
    totals.tileCount = round2(totals.tileCount);

    return totals;
  }

  // ─── Aggregate Labor ─────────────────────────────────────────────────────

  function aggregateLabor(estimates) {
    var laborByRole = {};

    estimates.forEach(function (est) {
      if (!est.laborResults || !est.laborResults.crew) return;

      est.laborResults.crew.forEach(function (member) {
        var key = member.role;
        if (!laborByRole[key]) {
          laborByRole[key] = 0;
        }
        laborByRole[key] += member.count * est.laborResults.totalDays;
      });
    });

    // Round all values
    var keys = Object.keys(laborByRole);
    keys.forEach(function (key) {
      laborByRole[key] = round2(laborByRole[key]);
    });

    return laborByRole;
  }

  // ─── Display Functions ───────────────────────────────────────────────────

  function displayMaterials(materials) {
    var html = '';

    if (materials.cementBags > 0) {
      html += '<div class="report-item"><span class="report-label">Cement Bags</span><span class="report-value">' + materials.cementBags + '</span></div>';
    }
    if (materials.sandVolume > 0) {
      html += '<div class="report-item"><span class="report-label">Sand (volume)</span><span class="report-value">' + materials.sandVolume + '</span></div>';
    }
    if (materials.crushVolume > 0) {
      html += '<div class="report-item"><span class="report-label">Crush (volume)</span><span class="report-value">' + materials.crushVolume + '</span></div>';
    }
    if (materials.blocks > 0) {
      html += '<div class="report-item"><span class="report-label">Blocks</span><span class="report-value">' + materials.blocks + '</span></div>';
    }
    if (materials.steelKg > 0) {
      html += '<div class="report-item"><span class="report-label">Steel (kg)</span><span class="report-value">' + materials.steelKg + '</span></div>';
    }
    if (materials.tileCount > 0) {
      html += '<div class="report-item"><span class="report-label">Tiles</span><span class="report-value">' + materials.tileCount + '</span></div>';
    }

    if (!html) {
      html = '<div class="empty-state"><p>No material data to display.</p></div>';
    }

    materialTotalsContent.innerHTML = html;
  }

  function displayLabor(laborByRole) {
    var keys = Object.keys(laborByRole);
    var html = '';

    if (keys.length === 0) {
      html = '<div class="empty-state"><p>No labor data available.</p></div>';
    } else {
      keys.forEach(function (role) {
        html += '<div class="report-item"><span class="report-label">' + escapeHtml(role) + '</span><span class="report-value">' + laborByRole[role] + ' man-days</span></div>';
      });
    }

    laborTotalsContent.innerHTML = html;
  }

  // ─── Clear Report ────────────────────────────────────────────────────────

  function clearReport() {
    materialTotalsContent.innerHTML = '<div class="empty-state"><p>Select a project or client to view reports.</p></div>';
    laborTotalsContent.innerHTML = '<div class="empty-state"><p>No labor data available.</p></div>';
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function round2(val) {
    return Math.round(val * 100) / 100;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    init: init,
    renderProjectReport: renderProjectReport,
    renderClientReport: renderClientReport,
    aggregateMaterials: aggregateMaterials,
    aggregateLabor: aggregateLabor
  };
})();
