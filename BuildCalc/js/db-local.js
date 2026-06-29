/**
 * db-local.js  — localStorage backend for BuildCalc
 *
 * Mirrors every method of DB exactly so all modules work unchanged
 * when the app is opened as file://.
 *
 * Storage layout  (all keys prefixed "bc_"):
 *   bc_store_{storeName}   → JSON array of all records in that store
 *
 * Dependencies: none
 */
'use strict';

const DBLocal = (function () {

  // ── UUID generator (same as db.js) ───────────────────────────────────────
  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID)
      return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ── Store helpers ─────────────────────────────────────────────────────────
  var STORES = ['clients','projects','estimates','config',
                'workers','assignments','tasks','vendors','rfqs','purchaseOrders'];

  function key(storeName) { return 'bc_store_' + storeName; }

  function loadStore(storeName) {
    try {
      var raw = localStorage.getItem(key(storeName));
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }

  function saveStore(storeName, records) {
    try { localStorage.setItem(key(storeName), JSON.stringify(records)); } catch(e) {}
  }

  function getAll(storeName) {
    return Promise.resolve(loadStore(storeName));
  }

  function getById(storeName, id) {
    var records = loadStore(storeName);
    return Promise.resolve(records.find(function(r){ return r.id === id; }) || undefined);
  }

  function add(storeName, record) {
    if (!record.id) record.id = generateId();
    if (!record.createdAt) record.createdAt = new Date().toISOString();
    var records = loadStore(storeName);
    records.push(record);
    saveStore(storeName, records);
    return Promise.resolve(record.id);
  }

  function put(storeName, record) {
    var records = loadStore(storeName);
    var idx = records.findIndex(function(r){ return r.id === record.id; });
    if (idx >= 0) records[idx] = record;
    else records.push(record);
    saveStore(storeName, records);
    return Promise.resolve(record.id);
  }

  function remove(storeName, id) {
    var records = loadStore(storeName).filter(function(r){ return r.id !== id; });
    saveStore(storeName, records);
    return Promise.resolve();
  }

  function getByIndex(storeName, indexName, value) {
    var records = loadStore(storeName).filter(function(r){ return r[indexName] === value; });
    return Promise.resolve(records);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    // Ensure all stores exist (no-op for localStorage — they're created on first write)
    return Promise.resolve();
  }

  // ── Client CRUD ───────────────────────────────────────────────────────────
  function addClient(c)       { return add('clients', c); }
  function getClient(id)      { return getById('clients', id); }
  function getAllClients()     { return getAll('clients'); }
  function updateClient(c)    { return put('clients', c); }
  function deleteClient(id)   { return remove('clients', id); }

  // ── Project CRUD ──────────────────────────────────────────────────────────
  function addProject(p)                { return add('projects', p); }
  function getProject(id)               { return getById('projects', id); }
  function getAllProjects()              { return getAll('projects'); }
  function getProjectsByClient(cid)     { return getByIndex('projects','clientId',cid); }
  function updateProject(p)             { return put('projects', p); }
  function deleteProject(id)            { return remove('projects', id); }

  // ── Estimate CRUD ─────────────────────────────────────────────────────────
  function addEstimate(e)               { return add('estimates', e); }
  function getEstimate(id)              { return getById('estimates', id); }
  function getEstimatesByProject(pid)   { return getByIndex('estimates','projectId',pid); }
  function updateEstimate(e)            { return put('estimates', e); }
  function deleteEstimate(id)           { return remove('estimates', id); }

  // ── Config CRUD ───────────────────────────────────────────────────────────
  function getConfig() {
    var records = loadStore('config');
    return Promise.resolve(records.find(function(r){ return r.id === 'main'; }) || null);
  }
  function saveConfig(cfg) {
    if (!cfg.id) cfg.id = 'main';
    return put('config', cfg);
  }

  // ── Worker CRUD ───────────────────────────────────────────────────────────
  function addWorker(w)          { return add('workers', w); }
  function getWorker(id)         { return getById('workers', id); }
  function getAllWorkers()        { return getAll('workers'); }
  function updateWorker(w)       { return put('workers', w); }
  function deleteWorker(id)      { return remove('workers', id); }
  function getWorkersByTeam(t)   { return getByIndex('workers','team',t); }

  // ── Assignment CRUD ───────────────────────────────────────────────────────
  function addAssignment(a)             { return add('assignments', a); }
  function getAssignment(id)            { return getById('assignments', id); }
  function getAssignmentsByEstimate(eid){ return getByIndex('assignments','estimateId',eid); }
  function getAssignmentsByProject(pid) { return getByIndex('assignments','projectId',pid); }
  function getAssignmentsByWorker(wid)  { return getByIndex('assignments','workerId',wid); }
  function updateAssignment(a)          { return put('assignments', a); }
  function deleteAssignment(id)         { return remove('assignments', id); }
  function deleteAssignmentsByEstimate(eid) {
    return getAssignmentsByEstimate(eid).then(function(list){
      return Promise.all(list.map(function(a){ return remove('assignments', a.id); }));
    });
  }

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  function addTask(t)                 { return add('tasks', t); }
  function getTask(id)                { return getById('tasks', id); }
  function getAllTasks()               { return getAll('tasks'); }
  function getTasksByProject(pid)     { return getByIndex('tasks','projectId',pid); }
  function getTasksByWorker(wid)      { return getByIndex('tasks','workerId',wid); }
  function updateTask(t)              { return put('tasks', t); }
  function deleteTask(id)             { return remove('tasks', id); }
  function deleteTasksByProject(pid) {
    return getTasksByProject(pid).then(function(list){
      return Promise.all(list.map(function(t){ return remove('tasks', t.id); }));
    });
  }

  // ── Vendor CRUD ───────────────────────────────────────────────────────────
  function addVendor(v)    { return add('vendors', v); }
  function getVendor(id)   { return getById('vendors', id); }
  function getAllVendors()  { return getAll('vendors'); }
  function updateVendor(v) { return put('vendors', v); }
  function deleteVendor(id){ return remove('vendors', id); }

  // ── Bulk ops ──────────────────────────────────────────────────────────────
  function exportAll() {
    var data = {};
    STORES.forEach(function(s){ data[s] = loadStore(s); });
    return Promise.resolve(data);
  }
  function importAll(data) {
    STORES.forEach(function(s){ if (data[s]) saveStore(s, data[s]); });
    return Promise.resolve();
  }
  function clearAll() {
    STORES.forEach(function(s){ saveStore(s, []); });
    return Promise.resolve();
  }

  // ── RFQ CRUD ─────────────────────────────────────────────────────────────
  function addRfq(r)           { return add("rfqs", r); }
  function getRfq(id)          { return getById("rfqs", id); }
  function getRfqsByProject(p) { return getByIndex("rfqs","projectId",p); }
  function updateRfq(r)        { return put("rfqs", r); }
  function deleteRfq(id)       { return remove("rfqs", id); }

  // ── PO CRUD ──────────────────────────────────────────────────────────────
  function addPO(po)           { return add("purchaseOrders", po); }
  function getPO(id)           { return getById("purchaseOrders", id); }
  function getPOsByProject(p)  { return getByIndex("purchaseOrders","projectId",p); }
  function updatePO(po)        { return put("purchaseOrders", po); }
  function deletePO(id)        { return remove("purchaseOrders", id); }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    init: init,
    generateId: generateId,
    addClient: addClient, getClient: getClient, getAllClients: getAllClients,
    updateClient: updateClient, deleteClient: deleteClient,
    addProject: addProject, getProject: getProject, getAllProjects: getAllProjects,
    getProjectsByClient: getProjectsByClient, updateProject: updateProject, deleteProject: deleteProject,
    addEstimate: addEstimate, getEstimate: getEstimate, getEstimatesByProject: getEstimatesByProject,
    updateEstimate: updateEstimate, deleteEstimate: deleteEstimate,
    getConfig: getConfig, saveConfig: saveConfig,
    exportAll: exportAll, importAll: importAll, clearAll: clearAll,
    addWorker: addWorker, getWorker: getWorker, getAllWorkers: getAllWorkers,
    updateWorker: updateWorker, deleteWorker: deleteWorker, getWorkersByTeam: getWorkersByTeam,
    addAssignment: addAssignment, getAssignment: getAssignment,
    getAssignmentsByEstimate: getAssignmentsByEstimate,
    getAssignmentsByProject: getAssignmentsByProject,
    getAssignmentsByWorker: getAssignmentsByWorker,
    updateAssignment: updateAssignment, deleteAssignment: deleteAssignment,
    deleteAssignmentsByEstimate: deleteAssignmentsByEstimate,
    addTask: addTask, getTask: getTask, getAllTasks: getAllTasks,
    getTasksByProject: getTasksByProject, getTasksByWorker: getTasksByWorker,
    updateTask: updateTask, deleteTask: deleteTask, deleteTasksByProject: deleteTasksByProject,
    addVendor: addVendor, getVendor: getVendor, getAllVendors: getAllVendors,
    updateVendor: updateVendor, deleteVendor: deleteVendor,
    addRfq: addRfq, getRfq: getRfq, getRfqsByProject: getRfqsByProject,
    updateRfq: updateRfq, deleteRfq: deleteRfq,
    addPO: addPO, getPO: getPO, getPOsByProject: getPOsByProject,
    updatePO: updatePO, deletePO: deletePO
  };
})();
