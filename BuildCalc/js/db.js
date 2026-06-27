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
  const DB_VERSION = 1;
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
    clearAll: clearAll
  };
})();
