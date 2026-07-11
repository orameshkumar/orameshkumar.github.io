/**
 * FirebaseSync - Cloud synchronization layer for SPARK Badminton Doubles Score Sheet
 * 
 * Implements offline-first, dual-write pattern using Firebase Firestore.
 * All data mutations write to localStorage first (synchronous), then to Firestore (async).
 * On startup, fetches Firestore data and merges with localStorage using timestamp-based conflict resolution.
 */

const firebaseConfig = {
    apiKey: "AIzaSyD4cbWMOg3yWNHiFW-yCMb5qJUjtSYGGbk",
    authDomain: "badmintonscoresheet.firebaseapp.com",
    projectId: "badmintonscoresheet",
    storageBucket: "badmintonscoresheet.firebasestorage.app",
    messagingSenderId: "316471666113",
    appId: "1:316471666113:web:7e6907ae7e802efb44fb40"
};

class FirebaseSync {
    constructor(app) {
        this.app = app;
        this.db = null;
        this.available = false;
        this._activeWriteTimer = null;
        this._pendingActiveState = null;
        this.init();
    }

    /**
     * Async initialization - called from constructor
     */
    async init() {
        this.initFirebase();
        if (!this.available) return;

        this.enableOfflinePersistence();
        this.startConnectivityMonitor();
        await this.loadAndMerge();
    }

    // ─── Task 2.1: Firebase Initialization ────────────────────────────────────

    initFirebase() {
        if (typeof window.firebase === 'undefined') {
            console.warn('[FirebaseSync] Firebase SDK not loaded. Running in localStorage-only mode.');
            this.available = false;
            this.setSyncStatus('offline');
            return;
        }

        try {
            firebase.initializeApp(firebaseConfig);
            this.db = firebase.firestore();
            this.available = true;
        } catch (error) {
            console.warn('[FirebaseSync] Firebase initialization failed:', error);
            this.available = false;
            this.setSyncStatus('offline');
        }
    }

    // ─── Task 2.2: Offline Persistence + Connectivity Monitoring ──────────────

    enableOfflinePersistence() {
        if (!this.available) return;

        this.db.enablePersistence({ synchronizeTabs: false })
            .catch((err) => {
                if (err.code === 'failed-precondition') {
                    // Multiple tabs open - persistence can only be enabled in one tab at a time
                    console.warn('[FirebaseSync] Persistence failed: multiple tabs open.');
                } else if (err.code === 'unimplemented') {
                    // Browser does not support required features
                    console.warn('[FirebaseSync] Persistence not supported in this browser.');
                }
            });
    }

    startConnectivityMonitor() {
        window.addEventListener('online', () => {
            this.setSyncStatus('syncing');
            this.loadAndMerge();
        });

        window.addEventListener('offline', () => {
            this.setSyncStatus('offline');
        });

        // Set initial status based on current connectivity
        if (!navigator.onLine) {
            this.setSyncStatus('offline');
        }
    }

    // ─── Task 3.2: setSyncStatus Method ───────────────────────────────────────

    setSyncStatus(status) {
        const el = document.getElementById('sync-status');
        if (!el) return;

        el.className = `sync-indicator sync-${status}`;

        const labelEl = el.querySelector('.sync-label');
        if (labelEl) {
            const labels = {
                synced: 'Synced',
                syncing: 'Syncing',
                offline: 'Offline'
            };
            labelEl.textContent = labels[status] || 'Offline';
        }

        const titles = {
            synced: 'All data synced to cloud',
            syncing: 'Syncing data...',
            offline: 'Working offline'
        };
        el.title = titles[status] || 'Sync Status';
    }

    // ─── Task 4.1: mergeMatchHistory ──────────────────────────────────────────

    mergeMatchHistory(local, remote) {
        const map = new Map();

        // Add all local records to the map
        if (Array.isArray(local)) {
            for (const record of local) {
                if (record && record.id != null) {
                    map.set(String(record.id), record);
                }
            }
        }

        // Merge remote records - for duplicates, keep later lastModified
        if (Array.isArray(remote)) {
            for (const record of remote) {
                if (!record || record.id == null) continue;
                const key = String(record.id);
                const existing = map.get(key);

                if (!existing) {
                    map.set(key, record);
                } else {
                    // Both exist - resolve conflict by lastModified
                    const existingTime = existing.lastModified || 0;
                    const remoteTime = record.lastModified || 0;

                    if (remoteTime > existingTime) {
                        map.set(key, record);
                    }
                    // If equal or remote is older, keep existing (local)
                }
            }
        }

        // Convert to array, sort by date descending, cap at 100
        const merged = Array.from(map.values());
        merged.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });

        return merged.slice(0, 100);
    }

    // ─── Task 4.2: mergePlayerRegistry ────────────────────────────────────────

    mergePlayerRegistry(local, remote) {
        const seen = new Map(); // lowercase -> original casing
        const result = [];

        const addNames = (arr) => {
            if (!Array.isArray(arr)) return;
            for (const name of arr) {
                if (typeof name !== 'string' || !name.trim()) continue;
                const lower = name.toLowerCase();
                if (!seen.has(lower)) {
                    seen.set(lower, name);
                    result.push(name);
                }
            }
        };

        // Process local first (first casing encountered wins)
        addNames(local);
        addNames(remote);

        // Sort alphabetically (case-insensitive)
        result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        return result;
    }

    // ─── Task 4.3: resolveActiveMatch ─────────────────────────────────────────

    resolveActiveMatch(local, remote) {
        // If only one exists, use it
        if (!local && !remote) return null;
        if (!local) return remote;
        if (!remote) return local;

        // Both exist - compare lastModified
        const localTime = local.lastModified || 0;
        const remoteTime = remote.lastModified || 0;

        // If neither has timestamp, prefer remote (cloud is canonical)
        if (!localTime && !remoteTime) return remote;

        // Later timestamp wins
        if (remoteTime >= localTime) return remote;
        return local;
    }

    // ─── Task 6.1: saveMatch ──────────────────────────────────────────────────

    async saveMatch(record, eventId) {
        if (!this.available) return;
        const eid = eventId || this.app?.eventManager?.getActiveEventId();
        if (!eid) return;

        try {
            this.setSyncStatus('syncing');
            const data = { ...record, lastModified: Date.now() };
            await this.db.collection('events').doc(eid).collection('matches').doc(String(record.id)).set(data);
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('[FirebaseSync] Failed to save match:', error);
            this.setSyncStatus('offline');
        }
    }

    // ─── Task 6.2: savePlayerRegistry ─────────────────────────────────────────

    async savePlayerRegistry(names, eventId) {
        if (!this.available) return;
        const eid = eventId || this.app?.eventManager?.getActiveEventId();
        if (!eid) return;

        try {
            this.setSyncStatus('syncing');
            await this.db.collection('events').doc(eid).collection('playerRegistry').doc('data').set({
                names: names,
                lastModified: Date.now()
            });
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('[FirebaseSync] Failed to save player registry:', error);
            this.setSyncStatus('offline');
        }
    }

    // ─── Task 6.3: saveActiveMatch with Debounce ──────────────────────────────

    saveActiveMatch(state) {
        if (!this.available) return;
        this.debouncedActiveMatchWrite(state);
    }

    debouncedActiveMatchWrite(state) {
        this._pendingActiveState = state;
        if (this._activeWriteTimer) return; // Already scheduled

        this._activeWriteTimer = setTimeout(async () => {
            this._activeWriteTimer = null;
            if (this._pendingActiveState) {
                await this._writeActiveMatch(this._pendingActiveState);
                this._pendingActiveState = null;
            }
        }, 2000);
    }

    async _writeActiveMatch(state) {
        const eid = this.app?.eventManager?.getActiveEventId();
        if (!eid) return;

        try {
            this.setSyncStatus('syncing');
            await this.db.collection('events').doc(eid).collection('appData').doc('activeMatch').set({
                ...state,
                lastModified: Date.now()
            });
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('[FirebaseSync] Failed to save active match:', error);
            this.setSyncStatus('offline');
        }
    }

    // ─── Task 6.4: clearActiveMatch ───────────────────────────────────────────

    async clearActiveMatch() {
        if (!this.available) return;
        const eid = this.app?.eventManager?.getActiveEventId();
        if (!eid) return;

        try {
            await this.db.collection('events').doc(eid).collection('appData').doc('activeMatch').delete();
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('[FirebaseSync] Failed to clear active match:', error);
        }
    }

    // ─── Member Sync Methods ──────────────────────────────────────────────────

    async saveMember(eventId, member) {
        if (!this.available || !eventId) return;
        try {
            await this.db.collection('events').doc(eventId).collection('members').doc(member.id).set({...member, lastModified: Date.now()});
        } catch(e) { console.error('[FirebaseSync] Failed to save member:', e); }
    }

    async deleteMemberDoc(eventId, memberId) {
        if (!this.available || !eventId) return;
        try {
            await this.db.collection('events').doc(eventId).collection('members').doc(memberId).delete();
        } catch(e) { console.error('[FirebaseSync] Failed to delete member:', e); }
    }

    // ─── Save Event metadata ──────────────────────────────────────────────────

    async saveEvent(event) {
        if (!this.available) return;
        try {
            await this.db.collection('events').doc(event.id).set({
                ...event,
                lastModified: Date.now()
            });
        } catch (e) {
            console.error('[FirebaseSync] Failed to save event:', e);
        }
    }

    // ─── Task 7.1: loadAndMerge ───────────────────────────────────────────────

    async loadAndMerge() {
        if (!this.available) {
            this.setSyncStatus('offline');
            return;
        }

        this.setSyncStatus('syncing');

        try {
            const eid = this.app?.eventManager?.getActiveEventId();
            if (!eid) {
                this.setSyncStatus('synced');
                return;
            }

            // Fetch all data from Firestore with a 3-second timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Firestore fetch timeout')), 3000)
            );

            const fetchPromise = this._fetchFirestoreData(eid);
            const remoteData = await Promise.race([fetchPromise, timeoutPromise]);

            // Check for first-sync / migration scenario
            await this.migrateLocalData(remoteData.matches, eid);

            // Merge match history
            const localMatches = this._getLocalMatchHistory();
            const mergedMatches = this.mergeMatchHistory(localMatches, remoteData.matches);
            const matchHistoryKey = this.app?.eventManager?.getMatchHistoryKey() || 'badminton-match-history';
            localStorage.setItem(matchHistoryKey, JSON.stringify(mergedMatches));

            // Merge player registry
            const localPlayers = this._getLocalPlayerRegistry();
            const mergedPlayers = this.mergePlayerRegistry(localPlayers, remoteData.players);
            const playerNamesKey = this.app?.eventManager?.getPlayerNamesKey() || 'badminton-player-names';
            localStorage.setItem(playerNamesKey, JSON.stringify(mergedPlayers));

            // Resolve active match
            const localActive = this._getLocalActiveMatch();
            const resolvedActive = this.resolveActiveMatch(localActive, remoteData.activeMatch);
            if (resolvedActive) {
                const activeMatchKey = this.app?.eventManager?.getActiveMatchKey() || 'badminton-active-match';
                localStorage.setItem(activeMatchKey, JSON.stringify(resolvedActive));
            }

            // Update UI via app methods
            if (this.app) {
                if (typeof this.app.loadMatchHistory === 'function') {
                    this.app.loadMatchHistory();
                }
                if (typeof this.app.loadPlayerNames === 'function') {
                    this.app.loadPlayerNames();
                }
                if (resolvedActive && typeof this.app.restoreActiveMatch === 'function') {
                    this.app.restoreActiveMatch();
                }
            }

            this.setSyncStatus('synced');
        } catch (error) {
            console.warn('[FirebaseSync] Load and merge failed, using localStorage:', error.message);
            this.setSyncStatus('offline');
        }
    }

    async _fetchFirestoreData(eventId) {
        const eid = eventId || this.app?.eventManager?.getActiveEventId();
        if (!eid) return { matches: [], players: [], activeMatch: null };

        // Fetch matches collection (event-scoped)
        const matchesSnapshot = await this.db.collection('events').doc(eid).collection('matches').get();
        const matches = [];
        matchesSnapshot.forEach(doc => {
            matches.push(doc.data());
        });

        // Fetch player registry (event-scoped)
        const playerDoc = await this.db.collection('events').doc(eid).collection('playerRegistry').doc('data').get();
        const players = playerDoc.exists ? (playerDoc.data().names || []) : [];

        // Fetch active match (event-scoped)
        const activeDoc = await this.db.collection('events').doc(eid).collection('appData').doc('activeMatch').get();
        const activeMatch = activeDoc.exists ? activeDoc.data() : null;

        return { matches, players, activeMatch };
    }

    // ─── Task 7.2: First-Sync Detection + Migration ──────────────────────────

    async migrateLocalData(remoteMatches, eventId) {
        // Skip if migration already done
        if (localStorage.getItem('firebase-migration-done') === 'true') return;

        // Only migrate if remote is empty and local has data
        if (remoteMatches && remoteMatches.length > 0) return;

        const localMatches = this._getLocalMatchHistory();
        if (!localMatches || localMatches.length === 0) return;

        const eid = eventId || this.app?.eventManager?.getActiveEventId();
        if (!eid) return;

        console.log(`[FirebaseSync] First-sync detected. Migrating ${localMatches.length} matches to Firestore...`);

        try {
            // Upload matches in batches of 500 (event-scoped)
            const batchSize = 500;
            for (let i = 0; i < localMatches.length; i += batchSize) {
                const batch = this.db.batch();
                const chunk = localMatches.slice(i, i + batchSize);

                for (const record of chunk) {
                    if (!record || record.id == null) continue;
                    const docRef = this.db.collection('events').doc(eid).collection('matches').doc(String(record.id));
                    batch.set(docRef, { ...record, lastModified: Date.now() });
                }

                await batch.commit();
            }

            // Upload player registry (event-scoped)
            const localPlayers = this._getLocalPlayerRegistry();
            if (localPlayers && localPlayers.length > 0) {
                await this.db.collection('events').doc(eid).collection('playerRegistry').doc('data').set({
                    names: localPlayers,
                    lastModified: Date.now()
                });
            }

            // Upload active match if exists (event-scoped)
            const localActive = this._getLocalActiveMatch();
            if (localActive) {
                await this.db.collection('events').doc(eid).collection('appData').doc('activeMatch').set({
                    ...localActive,
                    lastModified: Date.now()
                });
            }

            // Mark migration as complete
            localStorage.setItem('firebase-migration-done', 'true');
            console.log(`[FirebaseSync] Migration complete. ${localMatches.length} matches uploaded.`);
        } catch (error) {
            console.error('[FirebaseSync] Migration failed (will retry on next load):', error);
            // Do NOT set migration flag - will retry on next load
        }
    }

    // ─── Helper Methods ───────────────────────────────────────────────────────

    _getLocalMatchHistory() {
        try {
            const key = this.app?.eventManager?.getMatchHistoryKey() || 'badminton-match-history';
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    _getLocalPlayerRegistry() {
        try {
            const key = this.app?.eventManager?.getPlayerNamesKey() || 'badminton-player-names';
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    _getLocalActiveMatch() {
        try {
            const key = this.app?.eventManager?.getActiveMatchKey() || 'badminton-active-match';
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }
}
