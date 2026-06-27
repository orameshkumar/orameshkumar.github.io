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

    // Bind print button
    var btnPrint = document.getElementById('btn-print-report');
    if (btnPrint) {
      btnPrint.addEventListener('click', function () {
        var projectId = projectSelect.value;
        var clientId = clientSelect.value;
        if (projectId) {
          generatePrintReport(projectId);
        } else if (clientId) {
          generateClientPrintReport(clientId);
        }
      });
    }

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

    // Show print button if a project or client is selected
    var btnPrint = document.getElementById('btn-print-report');
    if (btnPrint && (projectSelect.value || clientSelect.value)) {
      btnPrint.hidden = false;
    }
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

    // Show print button if a project or client is selected
    var btnPrint = document.getElementById('btn-print-report');
    if (btnPrint && (projectSelect.value || clientSelect.value)) {
      btnPrint.hidden = false;
    }
  }

  // ─── Clear Report ────────────────────────────────────────────────────────

  function clearReport() {
    materialTotalsContent.innerHTML = '<div class="empty-state"><p>Select a project or client to view reports.</p></div>';
    laborTotalsContent.innerHTML = '<div class="empty-state"><p>No labor data available.</p></div>';

    // Hide print button
    var btnPrint = document.getElementById('btn-print-report');
    if (btnPrint) btnPrint.hidden = true;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function round2(val) {
    return Math.round(val * 100) / 100;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Generate Print Report ───────────────────────────────────────────────

  function generatePrintReport(projectId) {
    if (!projectId) {
      return;
    }

    var projectData, clientData, estimatesData;

    DB.getProject(projectId).then(function (project) {
      projectData = project;
      return DB.getClient(project.clientId);
    }).then(function (client) {
      clientData = client;
      return DB.getEstimatesByProject(projectId);
    }).then(function (estimates) {
      estimatesData = estimates;

      if (!estimatesData || estimatesData.length === 0) {
        alert('No estimates to print for this project.');
        return;
      }

      var materials = aggregateMaterials(estimatesData);
      var labor = aggregateLabor(estimatesData);
      var dateStr = new Date().toLocaleDateString();

      // Build HTML
      var html = '<!DOCTYPE html><html><head>';
      html += '<title>BuildCalc Report - ' + escapeHtml(projectData.name) + '</title>';
      html += '<style>';
      html += 'body { font-family: Arial, sans-serif; padding: 20px; color: #1a1a2e; }';
      html += 'h1 { font-size: 1.5rem; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }';
      html += 'h2 { font-size: 1.1rem; color: #2563eb; margin-top: 20px; }';
      html += '.header-info { display: flex; justify-content: space-between; margin-bottom: 20px; color: #555; }';
      html += 'table { width: 100%; border-collapse: collapse; margin: 10px 0; }';
      html += 'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 0.9rem; }';
      html += 'th { background: #f5f5f5; font-weight: 600; }';
      html += '.estimate-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin: 10px 0; }';
      html += '.estimate-header { font-weight: 600; color: #2563eb; }';
      html += '.label { color: #666; }';
      html += '</style></head><body>';

      // Header
      html += '<h1>PROJECT ESTIMATE REPORT</h1>';
      html += '<div class="header-info">';
      html += '<div><span class="label">Client:</span> ' + escapeHtml(clientData ? clientData.name : 'N/A') + '</div>';
      html += '<div><span class="label">Project:</span> ' + escapeHtml(projectData.name) + '</div>';
      html += '<div><span class="label">Date:</span> ' + dateStr + '</div>';
      html += '</div>';

      // Material Summary Table
      html += '<h2>Material Summary</h2>';
      html += '<table><thead><tr><th>Material</th><th>Quantity</th></tr></thead><tbody>';
      if (materials.cementBags > 0) html += '<tr><td>Cement Bags</td><td>' + materials.cementBags + '</td></tr>';
      if (materials.sandVolume > 0) html += '<tr><td>Sand (volume)</td><td>' + materials.sandVolume + '</td></tr>';
      if (materials.crushVolume > 0) html += '<tr><td>Crush (volume)</td><td>' + materials.crushVolume + '</td></tr>';
      if (materials.blocks > 0) html += '<tr><td>Blocks</td><td>' + materials.blocks + '</td></tr>';
      if (materials.steelKg > 0) html += '<tr><td>Steel (kg)</td><td>' + materials.steelKg + '</td></tr>';
      if (materials.tileCount > 0) html += '<tr><td>Tiles</td><td>' + materials.tileCount + '</td></tr>';
      html += '</tbody></table>';

      // Labor Summary Table
      html += '<h2>Labor Summary</h2>';
      var laborKeys = Object.keys(labor);
      if (laborKeys.length > 0) {
        html += '<table><thead><tr><th>Role</th><th>Man-Days</th></tr></thead><tbody>';
        laborKeys.forEach(function (role) {
          html += '<tr><td>' + escapeHtml(role) + '</td><td>' + labor[role] + '</td></tr>';
        });
        html += '</tbody></table>';
      } else {
        html += '<p>No labor data available.</p>';
      }

      // Detailed Estimates Section
      html += '<h2>Detailed Estimates</h2>';
      estimatesData.sort(function (a, b) {
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      estimatesData.forEach(function (est, idx) {
        var catLabel = est.category.charAt(0).toUpperCase() + est.category.slice(1);
        html += '<div class="estimate-card">';
        html += '<div class="estimate-header">' + (idx + 1) + '. ' + escapeHtml(catLabel) + (est.tag ? ' — ' + escapeHtml(est.tag) : '') + '</div>';

        // Inputs
        html += '<p class="label">Inputs:</p>';
        html += '<table><thead><tr><th>Parameter</th><th>Value</th></tr></thead><tbody>';
        if (est.inputs) {
          var inputs = est.inputs;
          if (inputs.volume !== undefined) html += '<tr><td>Volume</td><td>' + inputs.volume + '</td></tr>';
          if (inputs.area !== undefined) html += '<tr><td>Area</td><td>' + inputs.area + '</td></tr>';
          if (inputs.floorArea !== undefined) html += '<tr><td>Floor Area</td><td>' + inputs.floorArea + '</td></tr>';
          if (inputs.tileArea !== undefined) html += '<tr><td>Tile Area</td><td>' + inputs.tileArea + '</td></tr>';
          if (inputs.thicknessMm !== undefined) html += '<tr><td>Thickness (mm)</td><td>' + inputs.thicknessMm + '</td></tr>';
          if (inputs.blockSizeId) html += '<tr><td>Block Size</td><td>' + escapeHtml(inputs.blockSizeId) + '</td></tr>';
          if (inputs.elementType) html += '<tr><td>Element Type</td><td>' + escapeHtml(inputs.elementType) + '</td></tr>';
          if (inputs.ratio) html += '<tr><td>Mix Ratio</td><td>' + inputs.ratio.join(' : ') + '</td></tr>';
        }
        html += '</tbody></table>';

        // Material Results
        html += '<p class="label">Material Results:</p>';
        html += '<table><thead><tr><th>Item</th><th>Value</th></tr></thead><tbody>';
        if (est.materialResults) {
          var mr = est.materialResults;
          if (mr.blocks !== undefined) html += '<tr><td>Blocks</td><td>' + mr.blocks + '</td></tr>';
          if (mr.mortarVolume !== undefined) html += '<tr><td>Mortar Volume</td><td>' + mr.mortarVolume + '</td></tr>';
          if (mr.cementBags !== undefined) html += '<tr><td>Cement Bags</td><td>' + mr.cementBags + '</td></tr>';
          if (mr.sandVolume !== undefined) html += '<tr><td>Sand Volume</td><td>' + mr.sandVolume + '</td></tr>';
          if (mr.crushVolume !== undefined) html += '<tr><td>Crush Volume</td><td>' + mr.crushVolume + '</td></tr>';
          if (mr.dryVolume !== undefined) html += '<tr><td>Dry Volume</td><td>' + mr.dryVolume + '</td></tr>';
          if (mr.weightKg !== undefined) html += '<tr><td>Steel Weight (kg)</td><td>' + mr.weightKg + '</td></tr>';
          if (mr.weightTons !== undefined) html += '<tr><td>Steel Weight (tons)</td><td>' + mr.weightTons + '</td></tr>';
          if (mr.tileCount !== undefined) html += '<tr><td>Tiles</td><td>' + mr.tileCount + '</td></tr>';
          if (mr.plasterVolume !== undefined) html += '<tr><td>Plaster Volume</td><td>' + mr.plasterVolume + '</td></tr>';
        }
        html += '</tbody></table>';

        // Labor Results
        if (est.laborResults && est.laborResults.crew && est.laborResults.crew.length > 0) {
          html += '<p class="label">Labor Results:</p>';
          html += '<table><thead><tr><th>Role</th><th>Count</th><th>Days</th></tr></thead><tbody>';
          est.laborResults.crew.forEach(function (member) {
            html += '<tr><td>' + escapeHtml(member.role) + '</td><td>' + member.count + '</td><td>' + est.laborResults.totalDays + '</td></tr>';
          });
          html += '</tbody></table>';
        }

        html += '</div>';
      });

      html += '</body></html>';

      // Open new window and print
      var printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(function () {
          printWin.print();
        }, 500);
      } else {
        alert('Please allow popups to print the report.');
      }
    });
  }

  // ─── Client-Level Print Report (all projects) ──────────────────────────────

  function generateClientPrintReport(clientId) {
    if (!clientId) return;

    var clientData;

    DB.getClient(clientId).then(function (client) {
      clientData = client;
      return DB.getProjectsByClient(clientId);
    }).then(function (projects) {
      if (!projects || projects.length === 0) {
        alert('No projects to print for this client.');
        return;
      }

      // Fetch estimates for each project
      var promises = projects.map(function (project) {
        return DB.getEstimatesByProject(project.id).then(function (estimates) {
          return { project: project, estimates: estimates };
        });
      });

      return Promise.all(promises).then(function (projectsWithEstimates) {
        var dateStr = new Date().toLocaleDateString();

        var html = '<!DOCTYPE html><html><head>';
        html += '<title>BuildCalc Report - ' + escapeHtml(clientData.name) + ' (All Projects)</title>';
        html += '<style>';
        html += 'body { font-family: Arial, sans-serif; padding: 20px; color: #1a1a2e; }';
        html += 'h1 { font-size: 1.5rem; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }';
        html += 'h2 { font-size: 1.2rem; color: #2563eb; margin-top: 24px; page-break-before: auto; }';
        html += 'h3 { font-size: 1rem; color: #333; margin-top: 16px; }';
        html += '.header-info { display: flex; justify-content: space-between; margin-bottom: 20px; color: #555; }';
        html += 'table { width: 100%; border-collapse: collapse; margin: 10px 0; }';
        html += 'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 0.9rem; }';
        html += 'th { background: #f5f5f5; font-weight: 600; }';
        html += '.project-divider { border-top: 3px solid #2563eb; margin: 30px 0 20px 0; page-break-before: always; }';
        html += '.project-divider:first-of-type { page-break-before: auto; border-top: none; margin-top: 10px; }';
        html += '.estimate-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin: 10px 0; }';
        html += '.estimate-header { font-weight: 600; color: #2563eb; }';
        html += '.label { color: #666; }';
        html += '.client-total { background: #f0f4ff; padding: 16px; border-radius: 8px; margin-top: 20px; border: 1px solid #2563eb; }';
        html += '</style></head><body>';

        // Client header
        html += '<h1>CLIENT ESTIMATE REPORT</h1>';
        html += '<div class="header-info">';
        html += '<div><span class="label">Client:</span> <strong>' + escapeHtml(clientData.name) + '</strong></div>';
        html += '<div><span class="label">Date:</span> ' + dateStr + '</div>';
        html += '<div><span class="label">Projects:</span> ' + projects.length + '</div>';
        html += '</div>';

        // Client-level totals
        var allEstimates = [];
        projectsWithEstimates.forEach(function (pw) {
          allEstimates = allEstimates.concat(pw.estimates);
        });
        var clientMaterials = aggregateMaterials(allEstimates);
        var clientLabor = aggregateLabor(allEstimates);

        html += '<div class="client-total">';
        html += '<h3>Client Total - All Projects Combined</h3>';
        html += '<table><thead><tr><th>Material</th><th>Total</th></tr></thead><tbody>';
        if (clientMaterials.cementBags > 0) html += '<tr><td>Cement Bags</td><td>' + clientMaterials.cementBags + '</td></tr>';
        if (clientMaterials.sandVolume > 0) html += '<tr><td>Sand</td><td>' + clientMaterials.sandVolume + '</td></tr>';
        if (clientMaterials.crushVolume > 0) html += '<tr><td>Crush</td><td>' + clientMaterials.crushVolume + '</td></tr>';
        if (clientMaterials.blocks > 0) html += '<tr><td>Blocks</td><td>' + clientMaterials.blocks + '</td></tr>';
        if (clientMaterials.steelKg > 0) html += '<tr><td>Steel (kg)</td><td>' + clientMaterials.steelKg + '</td></tr>';
        if (clientMaterials.tileCount > 0) html += '<tr><td>Tiles</td><td>' + clientMaterials.tileCount + '</td></tr>';
        html += '</tbody></table></div>';

        // Each project section with page break
        projectsWithEstimates.forEach(function (pw, pIdx) {
          var project = pw.project;
          var estimates = pw.estimates;

          html += '<div class="project-divider">';
          html += '<h2>Project ' + (pIdx + 1) + ': ' + escapeHtml(project.name) + '</h2>';

          if (estimates.length === 0) {
            html += '<p class="label">No estimates for this project.</p>';
            html += '</div>';
            return;
          }

          // Project material/labor summary
          var projMaterials = aggregateMaterials(estimates);
          var projLabor = aggregateLabor(estimates);

          html += '<h3>Material Summary</h3>';
          html += '<table><thead><tr><th>Material</th><th>Quantity</th></tr></thead><tbody>';
          if (projMaterials.cementBags > 0) html += '<tr><td>Cement Bags</td><td>' + projMaterials.cementBags + '</td></tr>';
          if (projMaterials.sandVolume > 0) html += '<tr><td>Sand</td><td>' + projMaterials.sandVolume + '</td></tr>';
          if (projMaterials.crushVolume > 0) html += '<tr><td>Crush</td><td>' + projMaterials.crushVolume + '</td></tr>';
          if (projMaterials.blocks > 0) html += '<tr><td>Blocks</td><td>' + projMaterials.blocks + '</td></tr>';
          if (projMaterials.steelKg > 0) html += '<tr><td>Steel (kg)</td><td>' + projMaterials.steelKg + '</td></tr>';
          if (projMaterials.tileCount > 0) html += '<tr><td>Tiles</td><td>' + projMaterials.tileCount + '</td></tr>';
          html += '</tbody></table>';

          var laborKeys = Object.keys(projLabor);
          if (laborKeys.length > 0) {
            html += '<h3>Labor Summary</h3>';
            html += '<table><thead><tr><th>Role</th><th>Man-Days</th></tr></thead><tbody>';
            laborKeys.forEach(function (role) {
              html += '<tr><td>' + escapeHtml(role) + '</td><td>' + projLabor[role] + '</td></tr>';
            });
            html += '</tbody></table>';
          }

          // Individual estimates
          html += '<h3>Detailed Estimates</h3>';
          estimates.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
          estimates.forEach(function (est, idx) {
            var catLabel = est.category.charAt(0).toUpperCase() + est.category.slice(1);
            html += '<div class="estimate-card">';
            html += '<div class="estimate-header">' + (idx + 1) + '. ' + escapeHtml(catLabel) + (est.tag ? ' — ' + escapeHtml(est.tag) : '') + '</div>';
            html += '<table><thead><tr><th>Item</th><th>Value</th></tr></thead><tbody>';
            if (est.materialResults) {
              var mr = est.materialResults;
              if (mr.blocks !== undefined) html += '<tr><td>Blocks</td><td>' + mr.blocks + '</td></tr>';
              if (mr.cementBags !== undefined) html += '<tr><td>Cement Bags</td><td>' + mr.cementBags + '</td></tr>';
              if (mr.sandVolume !== undefined) html += '<tr><td>Sand</td><td>' + mr.sandVolume + '</td></tr>';
              if (mr.crushVolume !== undefined) html += '<tr><td>Crush</td><td>' + mr.crushVolume + '</td></tr>';
              if (mr.weightKg !== undefined) html += '<tr><td>Steel (kg)</td><td>' + mr.weightKg + '</td></tr>';
              if (mr.tileCount !== undefined) html += '<tr><td>Tiles</td><td>' + mr.tileCount + '</td></tr>';
            }
            if (est.laborResults && est.laborResults.totalDays) {
              html += '<tr><td>Labor Days</td><td>' + est.laborResults.totalDays + '</td></tr>';
            }
            html += '</tbody></table></div>';
          });

          html += '</div>';
        });

        html += '</body></html>';

        var printWin = window.open('', '_blank');
        if (printWin) {
          printWin.document.write(html);
          printWin.document.close();
          printWin.focus();
          setTimeout(function () { printWin.print(); }, 500);
        } else {
          alert('Please allow popups to print the report.');
        }
      });
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    init: init,
    renderProjectReport: renderProjectReport,
    renderClientReport: renderClientReport,
    aggregateMaterials: aggregateMaterials,
    aggregateLabor: aggregateLabor,
    generatePrintReport: generatePrintReport,
    generateClientPrintReport: generateClientPrintReport
  };
})();
