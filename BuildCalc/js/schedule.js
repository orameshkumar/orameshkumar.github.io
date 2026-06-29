/**
 * schedule.js - Schedule Module for BuildCalc
 *
 * Phases 2-4: Assignment of workers to estimates, duration calculation,
 * task list generation, and Gantt-style schedule view.
 *
 * Dependencies: db.js, app.js
 */
'use strict';

const Schedule = (function () {

  var currentProjectId = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var noProjectNotice, projectNameEl;
  var tabBtns, tabPanels;
  var assignPanel, tasksPanel, ganttPanel;

  // Assign tab
  var estimatesList;

  // Assignment detail overlay
  var assignOverlay, assignEstTitle, assignEstDetail;
  var assignWorkersContainer, assignDurationEl, headcountSlider, headcountVal;
  var btnSaveAssign, btnCloseAssign;
  var currentEstimate = null;

  // Tasks tab
  var tasksList, tasksEmpty;
  var btnGenerateTasks;

  // Gantt tab
  var ganttSvg;

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    noProjectNotice = document.getElementById('sched-no-project');
    // ── Inline no-project selector ──────────────────────────────────────
    var _noProjectSel = document.getElementById('sched-project-select');
    if (_noProjectSel) {
      DB.getAllProjects().then(function(projs) {
        projs.sort(function(a,b){ return a.name.localeCompare(b.name); });
        projs.forEach(function(p) {
          var o = document.createElement('option');
          o.value = p.id; o.textContent = p.name;
          _noProjectSel.appendChild(o);
        });
      });
      _noProjectSel.addEventListener('change', function() {
        if (_noProjectSel.value) { App.setProjectContext(_noProjectSel.value); }
      });
    }

    projectNameEl   = document.getElementById('sched-project-name');
    tabBtns         = document.querySelectorAll('.sched-tab-btn');
    tabPanels       = document.querySelectorAll('.sched-tab-panel');

    assignPanel = document.getElementById('sched-panel-assign');
    tasksPanel  = document.getElementById('sched-panel-tasks');
    ganttPanel  = document.getElementById('sched-panel-gantt');

    estimatesList = document.getElementById('sched-estimates-list');

    assignOverlay       = document.getElementById('assign-overlay');
    assignEstTitle      = document.getElementById('assign-est-title');
    assignEstDetail     = document.getElementById('assign-est-detail');
    assignWorkersContainer = document.getElementById('assign-workers-container');
    assignDurationEl    = document.getElementById('assign-duration');
    headcountSlider     = document.getElementById('assign-headcount');
    headcountVal        = document.getElementById('assign-headcount-val');
    btnSaveAssign       = document.getElementById('btn-assign-save');
    btnCloseAssign      = document.getElementById('btn-assign-close');

    tasksList       = document.getElementById('tasks-list');
    tasksEmpty      = document.getElementById('tasks-empty');
    btnGenerateTasks = document.getElementById('btn-generate-tasks');

    ganttSvg = document.getElementById('gantt-svg-container');

    // Tab switching
    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = this.getAttribute('data-tab');
        tabBtns.forEach(function (b) { b.classList.remove('active'); b.removeAttribute('aria-selected'); });
        tabPanels.forEach(function (p) { p.hidden = true; });
        this.classList.add('active');
        this.setAttribute('aria-selected','true');
        document.getElementById('sched-panel-' + target).hidden = false;
        if (target === 'gantt') renderGantt();
      }.bind(btn));
    });

    if (headcountSlider) headcountSlider.addEventListener('input', function () {
      headcountVal.textContent = this.value;
      recalcDuration();
    });

    if (btnSaveAssign) btnSaveAssign.addEventListener('click', saveAssignment);
    if (btnCloseAssign) btnCloseAssign.addEventListener('click', function () { assignOverlay.hidden = true; });
    if (assignOverlay) assignOverlay.addEventListener('click', function (e) { if (e.target === assignOverlay) assignOverlay.hidden = true; });

    if (btnGenerateTasks) btnGenerateTasks.addEventListener('click', generateTasks);
  }

  // ── Project context ───────────────────────────────────────────────────────
  function setProject(projectId) {
    currentProjectId = projectId;
    refresh();
  }

  function refresh() {
    var has = !!currentProjectId;
    if (noProjectNotice) noProjectNotice.hidden = has;
    if (!has) return;

    DB.getProject(currentProjectId).then(function (p) {
      if (projectNameEl && p) projectNameEl.textContent = p.name;
    });
    renderAssignList();
    renderTasksList();
  }

  // ── ASSIGN TAB ────────────────────────────────────────────────────────────
  function renderAssignList() {
    if (!currentProjectId || !estimatesList) return;
    DB.getEstimatesByProject(currentProjectId).then(function (estimates) {
      if (estimates.length === 0) {
        estimatesList.innerHTML = '<div class="empty-state"><p>No estimates found for this project. Create estimates first.</p></div>';
        return;
      }
      return Promise.all(estimates.map(function (est) {
        return DB.getAssignmentsByEstimate(est.id).then(function (assigns) {
          return { est: est, assigns: assigns };
        });
      })).then(function (rows) {
        var html = '';
        rows.forEach(function (row) {
          var est = row.est, assigns = row.assigns;
          var catLabel = cap(est.category);
          var qty = getEstQty(est);
          var assignedSummary = assigns.length
            ? assigns.length + ' worker(s) assigned'
            : '<span class="assign-none">No workers assigned</span>';
          var badge = assigns.length
            ? '<span class="assign-badge assign-badge-done">Assigned</span>'
            : '<span class="assign-badge assign-badge-open">Open</span>';

          html += '<div class="list-item sched-est-item" data-id="' + est.id + '">'
            + '<div class="list-item-info">'
            + '<div class="list-item-title">' + esc(catLabel) + (est.tag ? ' — ' + esc(est.tag) : '') + ' ' + badge + '</div>'
            + '<div class="list-item-subtitle">Qty: ' + qty.value + ' ' + qty.unit + ' · ' + assignedSummary + '</div>'
            + '</div>'
            + '<button class="btn-outlined sched-assign-btn" data-id="' + est.id + '">Assign</button>'
            + '</div>';
        });
        estimatesList.innerHTML = html;

        estimatesList.querySelectorAll('.sched-assign-btn').forEach(function (btn) {
          btn.addEventListener('click', function () { openAssignOverlay(this.getAttribute('data-id')); });
        });
      });
    });
  }

  function getEstQty(est) {
    var i = est.inputs || {};
    if (est.category === 'masonry' || est.category === 'concreting' || est.category === 'steel') return { value: i.volume || 0, unit: est.unit === 'metric' ? 'cum' : 'Cft' };
    if (est.category === 'plastering') return { value: i.area || 0, unit: 'Sft' };
    if (est.category === 'tiling')     return { value: i.floorArea || 0, unit: 'Sft' };
    return { value: 0, unit: '' };
  }

  function openAssignOverlay(estimateId) {
    DB.getEstimate(estimateId).then(function (est) {
      if (!est) return;
      currentEstimate = est;
      assignEstTitle.textContent = cap(est.category) + (est.tag ? ' — ' + est.tag : '');
      var qty = getEstQty(est);
      var labor = (est.laborResults || {});
      assignEstDetail.textContent = 'Qty: ' + qty.value + ' ' + qty.unit
        + (labor.totalDays ? ' · Base duration: ' + labor.totalDays + ' days' : '');

      // Load existing assignments for this estimate
      return DB.getAssignmentsByEstimate(estimateId).then(function (existing) {
        return DB.getAllWorkers().then(function (workers) {
          renderAssignWorkers(workers, existing, est);
        });
      });
    }).then(function () {
      assignOverlay.hidden = false;
    });
  }

  function renderAssignWorkers(workers, existing, est) {
    // Group workers by skill match
    var catSkill = est.category;
    var matched = workers.filter(function (w) { return (w.skills || []).indexOf(catSkill) >= 0; });
    var others  = workers.filter(function (w) { return (w.skills || []).indexOf(catSkill) < 0; });

    var existingMap = {};
    existing.forEach(function (a) { existingMap[a.workerId] = a; });

    function workerRow(w) {
      var a = existingMap[w.id];
      var cnt = a ? a.count : 0;
      return '<div class="assign-worker-row">'
        + '<div class="assign-worker-info"><span class="assign-worker-name">' + esc(w.name) + '</span>'
        + '<span class="assign-worker-team">' + esc(w.team || '') + '</span></div>'
        + '<div class="assign-worker-ctrl">'
        + '<button class="btn-icon assign-dec" data-wid="' + w.id + '">−</button>'
        + '<span class="assign-cnt" id="ac-' + w.id + '">' + cnt + '</span>'
        + '<button class="btn-icon assign-inc" data-wid="' + w.id + '">+</button>'
        + '</div></div>';
    }

    var html = '';
    if (matched.length) html += '<p class="assign-section-label">Skilled in ' + cap(catSkill) + '</p>' + matched.map(workerRow).join('');
    if (others.length)  html += '<p class="assign-section-label" style="margin-top:12px">Other workers</p>' + others.map(workerRow).join('');
    if (!workers.length) html = '<p class="assign-section-label">No workers in pool. Add workers in the Workforce tab first.</p>';

    assignWorkersContainer.innerHTML = html;

    // Wire +/- buttons
    assignWorkersContainer.querySelectorAll('.assign-inc,.assign-dec').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wid = this.getAttribute('data-wid');
        var el  = document.getElementById('ac-' + wid);
        var v   = parseInt(el.textContent) || 0;
        if (this.classList.contains('assign-inc')) v++;
        else v = Math.max(0, v - 1);
        el.textContent = v;
        recalcDuration();
      });
    });

    recalcDuration();
  }

  function recalcDuration() {
    if (!currentEstimate) return;
    var labor = currentEstimate.laborResults || {};
    var baseDays = labor.totalDays || 0;
    var baseCrew = (labor.crew || []).reduce(function (s, c) { return s + (c.count || 1); }, 0) || 1;

    // Sum assigned counts
    var total = 0;
    (assignWorkersContainer.querySelectorAll('.assign-cnt') || []).forEach(function (el) {
      total += parseInt(el.textContent) || 0;
    });
    if (total < 1) { assignDurationEl.textContent = '—'; return; }

    // days = baseDays * baseCrew / assigned
    var days = baseDays > 0 ? Math.ceil(baseDays * baseCrew / total) : 0;
    assignDurationEl.textContent = days + ' day' + (days !== 1 ? 's' : '') + ' (' + total + ' workers)';
  }

  function saveAssignment() {
    if (!currentEstimate) return;
    var est = currentEstimate;

    // Collect counts
    var rows = [];
    assignWorkersContainer.querySelectorAll('.assign-cnt').forEach(function (el) {
      var wid = el.id.replace('ac-','');
      var cnt = parseInt(el.textContent) || 0;
      if (cnt > 0) rows.push({ workerId: wid, count: cnt });
    });

    // Delete existing then re-add
    DB.deleteAssignmentsByEstimate(est.id).then(function () {
      return Promise.all(rows.map(function (r) {
        return DB.addAssignment({
          estimateId: est.id,
          projectId:  est.projectId,
          workerId:   r.workerId,
          count:      r.count,
          category:   est.category,
          tag:        est.tag || ''
        });
      }));
    }).then(function () {
      assignOverlay.hidden = true;
      showToast('Assignment saved');
      renderAssignList();
    });
  }

  // ── TASKS TAB ─────────────────────────────────────────────────────────────
  function renderTasksList() {
    if (!currentProjectId || !tasksList) return;
    DB.getTasksByProject(currentProjectId).then(function (tasks) {
      if (tasks.length === 0) {
        tasksList.innerHTML = '';
        if (tasksEmpty) tasksEmpty.hidden = false;
        return;
      }
      if (tasksEmpty) tasksEmpty.hidden = true;

      // Fetch worker names
      return DB.getAllWorkers().then(function (workers) {
        var wmap = {};
        workers.forEach(function (w) { wmap[w.id] = w.name; });

        tasks.sort(function (a, b) { return new Date(a.startDate) - new Date(b.startDate); });

        var STATUS_LABELS = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };
        var STATUS_CSS    = { todo: 'task-todo', inprogress: 'task-inprogress', done: 'task-done' };

        var html = tasks.map(function (t) {
          var workerName = wmap[t.workerId] || 'Unassigned';
          var label = STATUS_LABELS[t.status] || t.status;
          var css   = STATUS_CSS[t.status]   || '';
          var end   = t.startDate && t.durationDays ? datePlusDays(t.startDate, t.durationDays - 1) : '—';
          return '<div class="list-item task-item">'
            + '<div class="list-item-info">'
            + '<div class="list-item-title">' + esc(t.title) + ' <span class="task-status-badge ' + css + '">' + label + '</span></div>'
            + '<div class="list-item-subtitle">Worker: ' + esc(workerName) + ' · ' + esc(t.startDate || '—') + ' → ' + esc(end) + ' (' + (t.durationDays||0) + ' days)</div>'
            + '</div>'
            + '<div class="task-status-btns">'
            + (t.status !== 'inprogress' ? '<button class="btn-icon task-next" data-id="' + t.id + '" data-status="inprogress" title="Mark in progress">▶</button>' : '')
            + (t.status !== 'done'       ? '<button class="btn-icon task-next" data-id="' + t.id + '" data-status="done"       title="Mark done">✔</button>' : '')
            + (t.status !== 'todo'       ? '<button class="btn-icon task-next" data-id="' + t.id + '" data-status="todo"        title="Reset to To Do">↺</button>' : '')
            + '<button class="btn-icon task-del" data-id="' + t.id + '" title="Delete">🗑️</button>'
            + '</div></div>';
        }).join('');
        tasksList.innerHTML = html;

        tasksList.querySelectorAll('.task-next').forEach(function (btn) {
          btn.addEventListener('click', function () {
            DB.getTask(this.getAttribute('data-id')).then(function (t) {
              t.status = btn.getAttribute('data-status');
              return DB.updateTask(t);
            }).then(function () { renderTasksList(); renderGantt(); });
          }.bind(btn));
        });
        tasksList.querySelectorAll('.task-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!confirm('Delete this task?')) return;
            DB.deleteTask(this.getAttribute('data-id')).then(function () {
              showToast('Task deleted');
              renderTasksList();
              renderGantt();
            });
          });
        });
      });
    });
  }

  function generateTasks() {
    if (!currentProjectId) return;
    DB.getAssignmentsByProject(currentProjectId).then(function (assigns) {
      if (assigns.length === 0) {
        showToast('No assignments found. Assign workers to estimates first.');
        return;
      }
      return DB.getEstimatesByProject(currentProjectId).then(function (estimates) {
        var estMap = {};
        estimates.forEach(function (e) { estMap[e.id] = e; });

        return DB.getAllWorkers().then(function (workers) {
          var wmap = {};
          workers.forEach(function (w) { wmap[w.id] = w; });

          // Group assignments by estimateId
          var byEst = {};
          assigns.forEach(function (a) {
            if (!byEst[a.estimateId]) byEst[a.estimateId] = [];
            byEst[a.estimateId].push(a);
          });

          var today = todayStr();
          var tasks = [];
          var workerNextDate = {}; // track next available date per worker

          Object.keys(byEst).forEach(function (estId) {
            var est = estMap[estId];
            if (!est) return;
            var labor = est.laborResults || {};
            var baseDays = labor.totalDays || 1;
            var baseCrew = (labor.crew || []).reduce(function (s, c) { return s + (c.count || 1); }, 0) || 1;

            byEst[estId].forEach(function (a) {
              var wid = a.workerId;
              var workerCount = a.count || 1;
              var days = Math.ceil(baseDays * baseCrew / (workerCount * byEst[estId].length));
              days = Math.max(1, days);

              var start = workerNextDate[wid] || today;
              var title = cap(est.category) + (est.tag ? ' — ' + est.tag : '');
              tasks.push({
                projectId:    currentProjectId,
                estimateId:   estId,
                workerId:     wid,
                title:        title,
                category:     est.category,
                count:        workerCount,
                startDate:    start,
                durationDays: days,
                status:       'todo'
              });
              workerNextDate[wid] = datePlusDays(start, days);
            });
          });

          // Delete existing tasks for this project and recreate
          return DB.deleteTasksByProject(currentProjectId).then(function () {
            return Promise.all(tasks.map(function (t) { return DB.addTask(t); }));
          }).then(function () {
            showToast(tasks.length + ' tasks generated');
            renderTasksList();
            renderGantt();
          });
        });
      });
    });
  }

  // ── GANTT TAB ─────────────────────────────────────────────────────────────
  function renderGantt() {
    if (!ganttSvg || !currentProjectId) return;
    DB.getTasksByProject(currentProjectId).then(function (tasks) {
      if (tasks.length === 0) {
        ganttSvg.innerHTML = '<p class="empty-state"><p>No tasks yet. Generate tasks from the Tasks tab.</p></p>';
        return;
      }
      return DB.getAllWorkers().then(function (workers) {
        var wmap = {};
        workers.forEach(function (w) { wmap[w.id] = w.name; });
        drawGantt(tasks, wmap);
      });
    });
  }

  function drawGantt(tasks, wmap) {
    tasks.sort(function (a, b) { return new Date(a.startDate) - new Date(b.startDate); });

    var today = todayStr();
    // Find date range
    var minDate = tasks[0].startDate || today;
    var maxDate = tasks.reduce(function (m, t) {
      var end = t.startDate && t.durationDays ? datePlusDays(t.startDate, t.durationDays) : t.startDate;
      return end > m ? end : m;
    }, minDate);

    var totalDays = Math.max(1, daysDiff(minDate, maxDate)) + 2;

    var ROW_H = 52;          // taller rows so task + worker text both fit
    var LABEL_W = 180;       // wider label column
    var DAY_W = 28;          // fixed day width — chart scrolls horizontally
    var svgW = LABEL_W + totalDays * DAY_W;
    var HEADER_H = 36;
    var svgH = HEADER_H + tasks.length * ROW_H + 20;

    var STATUS_COLORS = { todo: '#6366f1', inprogress: '#f59e0b', done: '#22c55e' };

    // Build column headers (week labels)
    var headerCols = '';
    for (var d = 0; d < totalDays; d += 7) {
      var lbl = datePlusDays(minDate, d).slice(5); // MM-DD
      headerCols += '<text x="' + (LABEL_W + d * DAY_W + 2) + '" y="20" class="gantt-date-lbl">' + lbl + '</text>';
    }

    // Today line
    var todayOff = daysDiff(minDate, today);
    var todayX = todayOff >= 0 && todayOff <= totalDays ? LABEL_W + todayOff * DAY_W : -999;

    // Rows
    var rows = '';
    tasks.forEach(function (t, i) {
      var y = HEADER_H + i * ROW_H;
      var bg = i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)';
      rows += '<rect x="0" y="' + y + '" width="' + svgW + '" height="' + ROW_H + '" fill="' + bg + '"/>';

      // Label
      var workerName = wmap[t.workerId] || 'Unassigned';
      var lbl = truncate(t.title, 18);
      rows += '<text x="6" y="' + (y + 18) + '" class="gantt-row-lbl">' + esc(lbl) + '</text>';
      rows += '<text x="6" y="' + (y + 34) + '" class="gantt-row-sub">' + esc(workerName) + '</text>';

      // Bar
      var off = daysDiff(minDate, t.startDate || today);
      var dur = t.durationDays || 1;
      var bx = LABEL_W + off * DAY_W;
      var bw = Math.max(4, dur * DAY_W - 2);
      var color = STATUS_COLORS[t.status] || '#6366f1';
      rows += '<rect x="' + bx + '" y="' + (y + 8) + '" width="' + bw + '" height="' + (ROW_H - 18) + '" rx="4" fill="' + color + '" opacity="0.85" class="gantt-bar" data-id="' + t.id + '"/>';
      rows += '<text x="' + (bx + 5) + '" y="' + (y + ROW_H / 2 + 1) + '" class="gantt-bar-lbl" dominant-baseline="central">' + dur + 'd</text>';
    });

    // Use explicit pixel dimensions — no viewBox/scaling.
    // The .gantt-wrap container scrolls horizontally + vertically.
    var svg = '<svg xmlns="http://www.w3.org/2000/svg"'
      + ' width="' + svgW + '" height="' + svgH + '">'
      + '<rect width="' + svgW + '" height="' + svgH + '" fill="var(--bg-primary)"/>'
      + '<rect x="0" y="0" width="' + svgW + '" height="' + HEADER_H + '" fill="var(--bg-secondary)"/>'
      + '<line x1="' + LABEL_W + '" y1="0" x2="' + LABEL_W + '" y2="' + svgH + '" stroke="var(--border)" stroke-width="1"/>'
      + '<text x="6" y="22" class="gantt-row-lbl">Task / Worker</text>'
      + headerCols
      + rows
      + (todayX > 0 ? '<line x1="' + todayX + '" y1="0" x2="' + todayX + '" y2="' + svgH + '" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>' : '')
      + (todayX > 0 ? '<text x="' + (todayX + 3) + '" y="14" class="gantt-date-lbl" fill="var(--accent)">Today</text>' : '')
      + '</svg>';

    ganttSvg.innerHTML = svg;
  }

  // ── Date helpers ──────────────────────────────────────────────────────────
  function todayStr() { return new Date().toISOString().slice(0,10); }
  function datePlusDays(dateStr, n) {
    var d = new Date(dateStr); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0,10);
  }
  function daysDiff(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  // ── Misc helpers ──────────────────────────────────────────────────────────
  function cap(s)       { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function esc(s)       { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function truncate(s,n){ return s && s.length > n ? s.slice(0,n) + '…' : s || ''; }
  function showToast(msg) {
    var t = document.getElementById('toast'), m = document.getElementById('toast-message');
    if (t && m) { m.textContent = msg; t.hidden = false; setTimeout(function () { t.hidden = true; }, 3000); }
  }

  return {
    init: init,
    setProject: setProject,
    refresh: refresh
  };
})();
