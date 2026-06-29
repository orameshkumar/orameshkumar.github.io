/**
 * workforce.js - Workforce Pool Module for BuildCalc
 *
 * Manages workers: add/edit/delete workers, assign teams, multi-skill tags.
 * Workers are used by the Schedule module for assignment and duration calc.
 *
 * Dependencies: db.js
 */
'use strict';

const Workforce = (function () {

  var SKILLS = ['masonry','concreting','steel','plastering','tiling','carpentry','electrical','plumbing','general'];

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var listEl, emptyEl, formOverlay, formTitle;
  var fldName, fldTeam, fldPhone, skillCheckboxes;
  var btnSave, btnCancel, btnAdd;
  var filterTeamEl;
  var editingId = null;

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    listEl       = document.getElementById('workforce-list');
    emptyEl      = document.getElementById('workforce-empty');
    formOverlay  = document.getElementById('workforce-form-overlay');
    formTitle    = document.getElementById('workforce-form-title');
    fldName      = document.getElementById('wf-name');
    fldTeam      = document.getElementById('wf-team');
    fldPhone     = document.getElementById('wf-phone');
    filterTeamEl = document.getElementById('wf-filter-team');
    btnSave      = document.getElementById('btn-wf-save');
    btnCancel    = document.getElementById('btn-wf-cancel');
    btnAdd       = document.getElementById('btn-wf-add');

    // Build skill checkboxes
    var skillGrid = document.getElementById('wf-skills-grid');
    if (skillGrid) {
      skillGrid.innerHTML = SKILLS.map(function (s) {
        return '<label class="skill-chip"><input type="checkbox" value="' + s + '"><span>' + cap(s) + '</span></label>';
      }).join('');
    }
    skillCheckboxes = skillGrid ? skillGrid.querySelectorAll('input[type=checkbox]') : [];

    btnAdd.addEventListener('click', function () { openForm(null); });
    btnSave.addEventListener('click', save);
    btnCancel.addEventListener('click', closeForm);
    formOverlay.addEventListener('click', function (e) { if (e.target === formOverlay) closeForm(); });
    filterTeamEl.addEventListener('change', renderList);

    renderList();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function renderList() {
    DB.getAllWorkers().then(function (workers) {
      // Populate team filter
      var teams = {};
      workers.forEach(function (w) { if (w.team) teams[w.team] = true; });
      var cur = filterTeamEl.value;
      var opts = '<option value="">All teams</option>';
      Object.keys(teams).sort().forEach(function (t) {
        opts += '<option value="' + esc(t) + '"' + (t === cur ? ' selected' : '') + '>' + esc(t) + '</option>';
      });
      filterTeamEl.innerHTML = opts;

      var tf = filterTeamEl.value;
      var filtered = tf ? workers.filter(function (w) { return w.team === tf; }) : workers;

      if (filtered.length === 0) {
        listEl.innerHTML = '';
        emptyEl.hidden = false;
        return;
      }
      emptyEl.hidden = true;

      // Group by team
      var byTeam = {};
      filtered.forEach(function (w) {
        var t = w.team || 'Unassigned';
        if (!byTeam[t]) byTeam[t] = [];
        byTeam[t].push(w);
      });

      var html = '';
      Object.keys(byTeam).sort().forEach(function (team) {
        html += '<div class="wf-team-section"><h3 class="wf-team-name">' + esc(team) + '</h3>';
        byTeam[team].forEach(function (w) {
          var skills = (w.skills || []).map(function (s) {
            return '<span class="skill-tag">' + esc(cap(s)) + '</span>';
          }).join('');
          html += '<div class="list-item wf-item" data-id="' + w.id + '">'
            + '<div class="list-item-info">'
            + '<div class="list-item-title">' + esc(w.name) + '</div>'
            + '<div class="list-item-subtitle">' + (w.phone ? esc(w.phone) + ' · ' : '') + '<span class="skill-tags">' + (skills || '<em>No skills set</em>') + '</span></div>'
            + '</div>'
            + '<div class="list-item-actions">'
            + '<button class="btn-icon btn-wf-edit" data-id="' + w.id + '" aria-label="Edit worker">✏️</button>'
            + '<button class="btn-icon btn-wf-delete" data-id="' + w.id + '" aria-label="Delete worker">🗑️</button>'
            + '</div></div>';
        });
        html += '</div>';
      });
      listEl.innerHTML = html;
      emptyEl.hidden = true;

      listEl.querySelectorAll('.btn-wf-edit').forEach(function (btn) {
        btn.addEventListener('click', function (e) { e.stopPropagation(); openForm(this.getAttribute('data-id')); });
      });
      listEl.querySelectorAll('.btn-wf-delete').forEach(function (btn) {
        btn.addEventListener('click', function (e) { e.stopPropagation(); deleteWorker(this.getAttribute('data-id')); });
      });
    });
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  function openForm(id) {
    editingId = id;
    formTitle.textContent = id ? 'Edit Worker' : 'Add Worker';
    fldName.value = '';
    fldTeam.value = '';
    fldPhone.value = '';
    skillCheckboxes.forEach(function (chk) { chk.checked = false; });

    if (id) {
      DB.getWorker(id).then(function (w) {
        if (!w) return;
        fldName.value  = w.name  || '';
        fldTeam.value  = w.team  || '';
        fldPhone.value = w.phone || '';
        var skills = w.skills || [];
        skillCheckboxes.forEach(function (chk) { chk.checked = skills.indexOf(chk.value) >= 0; });
        formOverlay.hidden = false;
        fldName.focus();
      });
    } else {
      formOverlay.hidden = false;
      fldName.focus();
    }
  }

  function closeForm() {
    formOverlay.hidden = true;
    editingId = null;
  }

  function save() {
    var name = fldName.value.trim();
    var team = fldTeam.value.trim();
    if (!name) { fldName.focus(); showToast('Worker name is required'); return; }
    var skills = [];
    skillCheckboxes.forEach(function (chk) { if (chk.checked) skills.push(chk.value); });
    var w = { name: name, team: team, phone: fldPhone.value.trim(), skills: skills };

    var p;
    if (editingId) {
      w.id = editingId;
      p = DB.updateWorker(w).then(function () { showToast('Worker updated'); });
    } else {
      p = DB.addWorker(w).then(function () { showToast('Worker added'); });
    }
    p.then(function () { closeForm(); renderList(); });
  }

  function deleteWorker(id) {
    if (!confirm('Delete this worker? Any assignments will also be removed.')) return;
    DB.deleteWorker(id).then(function () {
      showToast('Worker deleted');
      renderList();
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function showToast(msg) {
    var t = document.getElementById('toast'), m = document.getElementById('toast-message');
    if (t && m) { m.textContent = msg; t.hidden = false; setTimeout(function () { t.hidden = true; }, 3000); }
  }

  return {
    init: init,
    renderList: renderList,
    SKILLS: SKILLS
  };
})();
