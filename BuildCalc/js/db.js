/**
 * db.js - IndexedDB Wrapper for BuildCalc
 *
 * Provides a global DB object with async CRUD methods for all object stores.
 *
 * Database: "BuildCalcDB" (version 1)
 * Object Stores:
 *   - clients: keyPath "id", index on "name"
 *   - projects: keyPath "id", indexes on "clientId" and "name"
 *   - estimates: keyPath "id", indexes on "projectId" and "category"
 *   - config: keyPath "id"
 *
 * Dependencies: none
 */
'use strict';

const DB = (function () {
  const DB_NAME = 'BuildCalcDB';
  const DB_VERSION = 5;
  let db = null;

  // ─── ID Generation ───────────────────────────────────────────────────────

  /**
   * Generate a UUID using crypto.randomUUID() with fallback for older browsers.
   * @returns {string} A UUID string
   */
  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ─── Database Initialization ─────────────────────────────────────────────

  /**
   * Opens/creates the BuildCalcDB database with required object stores and indexes.
   * @returns {Promise<IDBDatabase>}
   */
  function init() {
    return new Promise(function (resolve, reject) {
      if (db) {
        resolve(db);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = function () {
        reject(new Error('Failed to open database: ' + request.error));
      };

      request.onblocked = function () {
        reject(new Error('Database blocked'));
      };

      request.onsuccess = function (event) {
        db = event.target.result;
        resolve(db);
      };

      request.onupgradeneeded = function (event) {
        const database = event.target.result;

        // Create "clients" object store
        if (!database.objectStoreNames.contains('clients')) {
          const clientsStore = database.createObjectStore('clients', { keyPath: 'id' });
          clientsStore.createIndex('name', 'name', { unique: false });
        }

        // Create "projects" object store
        if (!database.objectStoreNames.contains('projects')) {
          const projectsStore = database.createObjectStore('projects', { keyPath: 'id' });
          projectsStore.createIndex('clientId', 'clientId', { unique: false });
          projectsStore.createIndex('name', 'name', { unique: false });
        }

        // Create "estimates" object store
        if (!database.objectStoreNames.contains('estimates')) {
          const estimatesStore = database.createObjectStore('estimates', { keyPath: 'id' });
          estimatesStore.createIndex('projectId', 'projectId', { unique: false });
          estimatesStore.createIndex('category', 'category', { unique: false });
        }

        // Create "config" object store
        if (!database.objectStoreNames.contains('config')) {
          database.createObjectStore('config', { keyPath: 'id' });
        }

        // ── New stores (v2) ──────────────────────────────────────────────
        if (!database.objectStoreNames.contains('workers')) {
          var workersStore = database.createObjectStore('workers', { keyPath: 'id' });
          workersStore.createIndex('team', 'team', { unique: false });
        }

        if (!database.objectStoreNames.contains('assignments')) {
          var assignStore = database.createObjectStore('assignments', { keyPath: 'id' });
          assignStore.createIndex('estimateId', 'estimateId', { unique: false });
          assignStore.createIndex('projectId',  'projectId',  { unique: false });
          assignStore.createIndex('workerId',   'workerId',   { unique: false });
        }

        if (!database.objectStoreNames.contains('tasks')) {
          var tasksStore = database.createObjectStore('tasks', { keyPath: 'id' });
          tasksStore.createIndex('projectId', 'projectId', { unique: false });
          tasksStore.createIndex('workerId',  'workerId',  { unique: false });
          tasksStore.createIndex('status',    'status',    { unique: false });
        }

        if (!database.objectStoreNames.contains('vendors')) {
          var vendorsStore = database.createObjectStore('vendors', { keyPath: 'id' });
          vendorsStore.createIndex('name', 'name', { unique: false });
        }

        // ── New stores (v3) — RFQ / Purchase Order ─────────────────────────
        if (!database.objectStoreNames.contains('rfqs')) {
          var rfqStore = database.createObjectStore('rfqs', { keyPath: 'id' });
          rfqStore.createIndex('projectId', 'projectId', { unique: false });
          rfqStore.createIndex('vendorId',  'vendorId',  { unique: false });
        }
        if (!database.objectStoreNames.contains('purchaseOrders')) {
          var poStore = database.createObjectStore('purchaseOrders', { keyPath: 'id' });
          poStore.createIndex('projectId', 'projectId', { unique: false });
          poStore.createIndex('rfqId',     'rfqId',     { unique: false });
        }

        // ── New store (v4) — Task Photos ────────────────────────────────────
        if (!database.objectStoreNames.contains('taskPhotos')) {
          var photoStore = database.createObjectStore('taskPhotos', { keyPath: 'id' });
          photoStore.createIndex('taskId',     'taskId',     { unique: false });
          photoStore.createIndex('estimateId', 'estimateId', { unique: false });
          photoStore.createIndex('projectId',  'projectId',  { unique: false });
          photoStore.createIndex('stage',      'stage',      { unique: false });
          photoStore.createIndex('tag',        'tag',        { unique: false });
        }
      };
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Returns an object store for the given store name and mode.
   * @param {string} storeName - Name of the object store
   * @param {string} mode - 'readonly' or 'readwrite'
   * @returns {IDBObjectStore}
   */
  function getStore(storeName, mode) {
    if (!db) {
      throw new Error('Database not initialized. Call DB.init() first.');
    }
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  /**
   * Wraps an IDBRequest in a Promise.
   * @param {IDBRequest} request
   * @returns {Promise}
   */
  function requestToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  /**
   * Gets all records from an index matching a specific key.
   * @param {string} storeName - Object store name
   * @param {string} indexName - Index name
   * @param {*} key - Key value to match
   * @returns {Promise<Array>}
   */
  function getAllByIndex(storeName, indexName, key) {
    return new Promise(function (resolve, reject) {
      const store = getStore(storeName, 'readonly');
      const index = store.index(indexName);
      const request = index.getAll(key);
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  // ─── Client CRUD ─────────────────────────────────────────────────────────

  /**
   * Add a new client record.
   * @param {Object} client - Client object (id will be generated if not provided)
   * @returns {Promise<string>} The id of the added client
   */
  function addClient(client) {
    if (!client.id) {
      client.id = generateId();
    }
    if (!client.createdAt) {
      client.createdAt = new Date().toISOString();
    }
    const store = getStore('clients', 'readwrite');
    return requestToPromise(store.add(client)).then(function () {
      return client.id;
    });
  }

  /**
   * Get a single client by id.
   * @param {string} id
   * @returns {Promise<Object|undefined>}
   */
  function getClient(id) {
    const store = getStore('clients', 'readonly');
    return requestToPromise(store.get(id));
  }

  /**
   * Get all clients.
   * @returns {Promise<Object[]>}
   */
  function getAllClients() {
    const store = getStore('clients', 'readonly');
    return requestToPromise(store.getAll());
  }

  /**
   * Update an existing client (put operation).
   * @param {Object} client - Client object with id
   * @returns {Promise<string>} The id of the updated client
   */
  function updateClient(client) {
    const store = getStore('clients', 'readwrite');
    return requestToPromise(store.put(client)).then(function () {
      return client.id;
    });
  }

  /**
   * Delete a client by id.
   * @param {string} id
   * @returns {Promise<void>}
   */
  function deleteClient(id) {
    const store = getStore('clients', 'readwrite');
    return requestToPromise(store.delete(id));
  }

  // ─── Project CRUD ────────────────────────────────────────────────────────

  /**
   * Add a new project record.
   * @param {Object} project - Project object (id will be generated if not provided)
   * @returns {Promise<string>} The id of the added project
   */
  function addProject(project) {
    if (!project.id) {
      project.id = generateId();
    }
    if (!project.createdAt) {
      project.createdAt = new Date().toISOString();
    }
    const store = getStore('projects', 'readwrite');
    return requestToPromise(store.add(project)).then(function () {
      return project.id;
    });
  }

  /**
   * Get a single project by id.
   * @param {string} id
   * @returns {Promise<Object|undefined>}
   */
  function getProject(id) {
    const store = getStore('projects', 'readonly');
    return requestToPromise(store.get(id));
  }

  /**
   * Get all projects.
   * @returns {Promise<Object[]>}
   */
  function getAllProjects() {
    const store = getStore('projects', 'readonly');
    return requestToPromise(store.getAll());
  }

  /**
   * Get all projects belonging to a specific client.
   * @param {string} clientId
   * @returns {Promise<Object[]>}
   */
  function getProjectsByClient(clientId) {
    return getAllByIndex('projects', 'clientId', clientId);
  }

  /**
   * Update an existing project (put operation).
   * @param {Object} project - Project object with id
   * @returns {Promise<string>} The id of the updated project
   */
  function updateProject(project) {
    const store = getStore('projects', 'readwrite');
    return requestToPromise(store.put(project)).then(function () {
      return project.id;
    });
  }

  /**
   * Delete a project by id.
   * @param {string} id
   * @returns {Promise<void>}
   */
  function deleteProject(id) {
    const store = getStore('projects', 'readwrite');
    return requestToPromise(store.delete(id));
  }

  // ─── Estimate CRUD ───────────────────────────────────────────────────────

  /**
   * Add a new estimate record.
   * @param {Object} estimate - Estimate object (id will be generated if not provided)
   * @returns {Promise<string>} The id of the added estimate
   */
  function addEstimate(estimate) {
    if (!estimate.id) {
      estimate.id = generateId();
    }
    if (!estimate.createdAt) {
      estimate.createdAt = new Date().toISOString();
    }
    const store = getStore('estimates', 'readwrite');
    return requestToPromise(store.add(estimate)).then(function () {
      return estimate.id;
    });
  }

  /**
   * Get a single estimate by id.
   * @param {string} id
   * @returns {Promise<Object|undefined>}
   */
  function getEstimate(id) {
    const store = getStore('estimates', 'readonly');
    return requestToPromise(store.get(id));
  }

  /**
   * Get all estimates belonging to a specific project.
   * @param {string} projectId
   * @returns {Promise<Object[]>}
   */
  function getEstimatesByProject(projectId) {
    return getAllByIndex('estimates', 'projectId', projectId);
  }

  /**
   * Update an existing estimate (put operation).
   * @param {Object} estimate - Estimate object with id
   * @returns {Promise<string>} The id of the updated estimate
   */
  function updateEstimate(estimate) {
    const store = getStore('estimates', 'readwrite');
    return requestToPromise(store.put(estimate)).then(function () {
      return estimate.id;
    });
  }

  /**
   * Delete an estimate by id.
   * @param {string} id
   * @returns {Promise<void>}
   */
  function deleteEstimate(id) {
    const store = getStore('estimates', 'readwrite');
    return requestToPromise(store.delete(id));
  }

  // ─── Config Operations ───────────────────────────────────────────────────

  /**
   * Get the configuration record (always stored with id: 'main').
   * @returns {Promise<Object|undefined>}
   */
  function getConfig() {
    const store = getStore('config', 'readonly');
    return requestToPromise(store.get('main'));
  }

  /**
   * Save/update the configuration record.
   * @param {Object} config - Config object (id will be set to 'main')
   * @returns {Promise<string>} The id ('main')
   */
  function saveConfig(config) {
    config.id = 'main';
    const store = getStore('config', 'readwrite');
    return requestToPromise(store.put(config)).then(function () {
      return config.id;
    });
  }

  // ─── RFQ + PO CRUD ───────────────────────────────────────────────────────

  function _storeAdd(store, rec) {
    if (!rec.id) rec.id = generateId();
    if (!rec.createdAt) rec.createdAt = new Date().toISOString();
    return new Promise(function(res,rej){ var tx=db.transaction(store,'readwrite'); var r=tx.objectStore(store).add(rec); r.onsuccess=function(){res(r.result);}; tx.onerror=function(){rej(tx.error);}; });
  }
  function _storeGet(store,id)        { return new Promise(function(res,rej){ var r=db.transaction(store,'readonly').objectStore(store).get(id); r.onsuccess=function(){res(r.result);}; r.onerror=function(){rej(r.error);}; }); }
  function _storeGetByIndex(store,idx,val) { return new Promise(function(res,rej){ var r=db.transaction(store,'readonly').objectStore(store).index(idx).getAll(val); r.onsuccess=function(){res(r.result);}; r.onerror=function(){rej(r.error);}; }); }
  function _storePut(store,rec)       { return new Promise(function(res,rej){ var tx=db.transaction(store,'readwrite'); var r=tx.objectStore(store).put(rec); r.onsuccess=function(){res(r.result);}; tx.onerror=function(){rej(tx.error);}; }); }
  function _storeDel(store,id)        { return new Promise(function(res,rej){ var tx=db.transaction(store,'readwrite'); var r=tx.objectStore(store).delete(id); r.onsuccess=function(){res();}; tx.onerror=function(){rej(tx.error);}; }); }

  function addRfq(r)           { return _storeAdd('rfqs', r); }
  function getRfq(id)          { return _storeGet('rfqs', id); }
  function getRfqsByProject(p) { return _storeGetByIndex('rfqs','projectId',p); }
  function updateRfq(r)        { return _storePut('rfqs', r); }
  function deleteRfq(id)       { return _storeDel('rfqs', id); }

  function addPO(po)           { return _storeAdd('purchaseOrders', po); }
  function getPO(id)           { return _storeGet('purchaseOrders', id); }
  function getPOsByProject(p)  { return _storeGetByIndex('purchaseOrders','projectId',p); }
  function updatePO(po)        { return _storePut('purchaseOrders', po); }
  function deletePO(id)        { return _storeDel('purchaseOrders', id); }

  // ─── Task Photo CRUD ─────────────────────────────────────────────────────
  function addTaskPhoto(p)            { return _storeAdd('taskPhotos', p); }
  function getTaskPhoto(id)           { return _storeGet('taskPhotos', id); }
  function getPhotosByTask(taskId)        { return _storeGetByIndex('taskPhotos','taskId',taskId); }
  function getPhotosByEstimate(estimateId){ return _storeGetByIndex('taskPhotos','estimateId',estimateId); }
  function getPhotosByProject(pid)    { return _storeGetByIndex('taskPhotos','projectId',pid); }
  function deleteTaskPhoto(id)        { return _storeDel('taskPhotos', id); }

  // ─── Bulk Operations ─────────────────────────────────────────────────────

  /**
   * Export all data from all object stores.
   * @returns {Promise<Object>} Export payload with version, timestamp, and all records
   */
  function exportAll() {
    return Promise.all([
      getAllClients(),
      getAllProjects(),
      (function () {
        const store = getStore('estimates', 'readonly');
        return requestToPromise(store.getAll());
      })(),
      getConfig()
    ]).then(function (results) {
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        clients: results[0],
        projects: results[1],
        estimates: results[2],
        config: results[3] || null
      };
    });
  }

  /**
   * Import data from an export payload, replacing all existing data.
   * @param {Object} payload - Export payload object
   * @returns {Promise<void>}
   */
  function importAll(payload) {
    return clearAll().then(function () {
      var promises = [];

      // Import clients
      if (payload.clients && payload.clients.length > 0) {
        payload.clients.forEach(function (client) {
          promises.push(
            (function () {
              const store = getStore('clients', 'readwrite');
              return requestToPromise(store.add(client));
            })()
          );
        });
      }

      // Import projects
      if (payload.projects && payload.projects.length > 0) {
        payload.projects.forEach(function (project) {
          promises.push(
            (function () {
              const store = getStore('projects', 'readwrite');
              return requestToPromise(store.add(project));
            })()
          );
        });
      }

      // Import estimates
      if (payload.estimates && payload.estimates.length > 0) {
        payload.estimates.forEach(function (estimate) {
          promises.push(
            (function () {
              const store = getStore('estimates', 'readwrite');
              return requestToPromise(store.add(estimate));
            })()
          );
        });
      }

      // Import config
      if (payload.config) {
        promises.push(saveConfig(payload.config));
      }

      return Promise.all(promises).then(function () {
        return undefined;
      });
    });
  }

  /**
   * Clear all data from all object stores.
   * @returns {Promise<void>}
   */
  function clearAll() {
    return new Promise(function (resolve, reject) {
      if (!db) {
        reject(new Error('Database not initialized. Call DB.init() first.'));
        return;
      }
      const tx = db.transaction(['clients', 'projects', 'estimates', 'config'], 'readwrite');
      tx.objectStore('clients').clear();
      tx.objectStore('projects').clear();
      tx.objectStore('estimates').clear();
      tx.objectStore('config').clear();

      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
    });
  }


  // ─── Worker CRUD ─────────────────────────────────────────────────────────
  function addWorker(w)    { if (!w.id) w.id = generateId(); if (!w.createdAt) w.createdAt = new Date().toISOString(); return requestToPromise(getStore('workers','readwrite').add(w)).then(function(){ return w.id; }); }
  function getWorker(id)   { return requestToPromise(getStore('workers','readonly').get(id)); }
  function getAllWorkers()  { return requestToPromise(getStore('workers','readonly').getAll()); }
  function updateWorker(w) { return requestToPromise(getStore('workers','readwrite').put(w)); }
  function deleteWorker(id){ return requestToPromise(getStore('workers','readwrite').delete(id)); }
  function getWorkersByTeam(team){ return getAllByIndex('workers','team',team); }

  // ─── Assignment CRUD ──────────────────────────────────────────────────────
  function addAssignment(a)    { if (!a.id) a.id = generateId(); if (!a.createdAt) a.createdAt = new Date().toISOString(); return requestToPromise(getStore('assignments','readwrite').add(a)).then(function(){ return a.id; }); }
  function getAssignment(id)   { return requestToPromise(getStore('assignments','readonly').get(id)); }
  function getAssignmentsByEstimate(estimateId){ return getAllByIndex('assignments','estimateId',estimateId); }
  function getAssignmentsByProject(projectId)  { return getAllByIndex('assignments','projectId',projectId); }
  function getAssignmentsByWorker(workerId)    { return getAllByIndex('assignments','workerId',workerId); }
  function updateAssignment(a) { return requestToPromise(getStore('assignments','readwrite').put(a)); }
  function deleteAssignment(id){ return requestToPromise(getStore('assignments','readwrite').delete(id)); }
  function deleteAssignmentsByEstimate(estimateId){
    return getAssignmentsByEstimate(estimateId).then(function(list){
      return Promise.all(list.map(function(a){ return deleteAssignment(a.id); }));
    });
  }

  // ─── Task CRUD ────────────────────────────────────────────────────────────
  function addTask(t)    { if (!t.id) t.id = generateId(); if (!t.createdAt) t.createdAt = new Date().toISOString(); return requestToPromise(getStore('tasks','readwrite').add(t)).then(function(){ return t.id; }); }
  function getTask(id)   { return requestToPromise(getStore('tasks','readonly').get(id)); }
  function getAllTasks()  { return requestToPromise(getStore('tasks','readonly').getAll()); }
  function getTasksByProject(projectId){ return getAllByIndex('tasks','projectId',projectId); }
  function getTasksByWorker(workerId)  { return getAllByIndex('tasks','workerId',workerId); }
  function updateTask(t) { return requestToPromise(getStore('tasks','readwrite').put(t)); }
  function deleteTask(id){ return requestToPromise(getStore('tasks','readwrite').delete(id)); }
  function deleteTasksByProject(projectId){
    return getTasksByProject(projectId).then(function(list){
      return Promise.all(list.map(function(t){ return deleteTask(t.id); }));
    });
  }

  // ─── Vendor CRUD ──────────────────────────────────────────────────────────
  function addVendor(v)    { if (!v.id) v.id = generateId(); if (!v.createdAt) v.createdAt = new Date().toISOString(); return requestToPromise(getStore('vendors','readwrite').add(v)).then(function(){ return v.id; }); }
  function getVendor(id)   { return requestToPromise(getStore('vendors','readonly').get(id)); }
  function getAllVendors()  { return requestToPromise(getStore('vendors','readonly').getAll()); }
  function updateVendor(v) { return requestToPromise(getStore('vendors','readwrite').put(v)); }
  function deleteVendor(id){ return requestToPromise(getStore('vendors','readwrite').delete(id)); }

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    init: init,
    generateId: generateId,

    // Client operations
    addClient: addClient,
    getClient: getClient,
    getAllClients: getAllClients,
    updateClient: updateClient,
    deleteClient: deleteClient,

    // Project operations
    addProject: addProject,
    getProject: getProject,
    getAllProjects: getAllProjects,
    getProjectsByClient: getProjectsByClient,
    updateProject: updateProject,
    deleteProject: deleteProject,

    // Estimate operations
    addEstimate: addEstimate,
    getEstimate: getEstimate,
    getEstimatesByProject: getEstimatesByProject,
    updateEstimate: updateEstimate,
    deleteEstimate: deleteEstimate,

    // Config operations
    getConfig: getConfig,
    saveConfig: saveConfig,

    // Bulk operations
    exportAll: exportAll,
    importAll: importAll,
    clearAll: clearAll,

    // Worker operations
    addWorker: addWorker, getWorker: getWorker, getAllWorkers: getAllWorkers,
    updateWorker: updateWorker, deleteWorker: deleteWorker, getWorkersByTeam: getWorkersByTeam,

    // Assignment operations
    addAssignment: addAssignment, getAssignment: getAssignment,
    getAssignmentsByEstimate: getAssignmentsByEstimate,
    getAssignmentsByProject: getAssignmentsByProject,
    getAssignmentsByWorker: getAssignmentsByWorker,
    updateAssignment: updateAssignment, deleteAssignment: deleteAssignment,
    deleteAssignmentsByEstimate: deleteAssignmentsByEstimate,

    // Task operations
    addTask: addTask, getTask: getTask, getAllTasks: getAllTasks,
    getTasksByProject: getTasksByProject, getTasksByWorker: getTasksByWorker,
    updateTask: updateTask, deleteTask: deleteTask, deleteTasksByProject: deleteTasksByProject,

    // Vendor operations
    addVendor: addVendor, getVendor: getVendor, getAllVendors: getAllVendors,
    updateVendor: updateVendor, deleteVendor: deleteVendor,
    addRfq: addRfq, getRfq: getRfq, getRfqsByProject: getRfqsByProject,
    updateRfq: updateRfq, deleteRfq: deleteRfq,
    addPO: addPO, getPO: getPO, getPOsByProject: getPOsByProject,
    updatePO: updatePO, deletePO: deletePO,
    addTaskPhoto: addTaskPhoto, getTaskPhoto: getTaskPhoto,
    getPhotosByTask: getPhotosByTask, getPhotosByEstimate: getPhotosByEstimate, getPhotosByProject: getPhotosByProject,
    deleteTaskPhoto: deleteTaskPhoto
  };
})();
// ── Auto-select backend ───────────────────────────────────────────────────
// On file:// IndexedDB is blocked by Chrome. Use the localStorage backend.
if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
  // DBLocal is defined in db-local.js (loaded before db.js in index.html)
  // Overwrite the global DB reference with the localStorage adapter.
  if (typeof DBLocal !== 'undefined') {
    // Copy all DBLocal methods onto DB so every module keeps working unchanged
    Object.keys(DBLocal).forEach(function(k){ DB[k] = DBLocal[k]; });
    console.log('[DB] Using localStorage backend (file:// detected)');
  }
}
