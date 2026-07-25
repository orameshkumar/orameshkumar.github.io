/**
 * FirebaseSync - Cloud synchronization layer for SPARK Badminton Doubles Score Sheet
 * 
 * Implements offline-first, push-first sync pattern using Firebase Firestore.
 * All data mutations write to localStorage first (synchronous), then to Firestore (async).
 * On sync, pushes all local data to Firebase first, then overwrites localStorage with Firebase data.
 * Firebase is the single source of truth after each sync operation.
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
        this._retryQueue = this._loadRetryQueue();
        this._syncing = false;
        this.init();
    }

    _loadRetryQueue() {
        try {
            const data = localStorage.getItem('firebase-retry-queue');
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    }

    _persistRetryQueue() {
        try {
            localStorage.setItem('firebase-retry-queue', JSON.stringify(this._retryQueue));
        } catch (e) {}
    }

    /**
     * Async initialization - called from constructor
     */
    async init() {
        this.initFirebase();
        if (!this.available) return;

        this.enableOfflinePersistence();
        this.startConnectivityMonitor();

        // Sync events list from Firebase FIRST (fixes multi-device ID mismatch)
        if (this.app?.eventManager?.initFromFirebase) {
            await this.app.eventManager.initFromFirebase();
        }

        await this.pushFirstSync();
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
            this.pushFirstSync();
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
            const labels = { synced: 'Synced', syncing: 'Syncing', offline: 'Offline', failed: 'Failed' };
            labelEl.textContent = labels[status] || 'Offline';
        }

        const titles = { synced: 'All data synced to cloud', syncing: 'Syncing data...', offline: 'Working offline', failed: 'Sync failed - tap Sync to retry' };
        el.title = titles[status] || 'Sync Status';
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
            this._retryQueue.push({ collectionPath: 'events/' + eid + '/matches', docId: String(record.id), data: { ...record, lastModified: Date.now() }, timestamp: Date.now() });
            this._persistRetryQueue();
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
            this._retryQueue.push({ collectionPath: 'events/' + eid + '/playerRegistry', docId: 'data', data: { names: names, lastModified: Date.now() }, timestamp: Date.now() });
            this._persistRetryQueue();
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
            this._retryQueue.push({ collectionPath: 'events/' + eid + '/appData', docId: 'activeMatch', data: { ...state, lastModified: Date.now() }, timestamp: Date.now() });
            this._persistRetryQueue();
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

    // ─── Retry Queue & Manual Sync ──────────────────────────────────────────

    async flushRetryQueue() {
        if (!this.available || this._retryQueue.length === 0) return { success: 0, failed: 0 };

        const remaining = [];
        let success = 0;

        for (const entry of this._retryQueue) {
            try {
                // Rebuild Firestore reference from stored path segments
                const pathParts = entry.collectionPath.split('/');
                let ref = this.db;
                for (let i = 0; i < pathParts.length; i++) {
                    ref = (i % 2 === 0) ? ref.collection(pathParts[i]) : ref.doc(pathParts[i]);
                }
                await ref.doc(entry.docId).set(entry.data);
                success++;
            } catch (e) {
                remaining.push(entry);
            }
        }

        this._retryQueue = remaining;
        this._persistRetryQueue();
        return { success, failed: remaining.length };
    }

    async manualSync() {
        if (!this.available) {
            this.setSyncStatus('offline');
            return;
        }

        await this.pushFirstSync();
    }

    _setSyncButtonState(syncing) {
        const btn = document.getElementById('btn-manual-sync');
        if (!btn) return;
        btn.disabled = syncing;
        btn.classList.toggle('syncing', syncing);
    }

    // ─── Push-First Sync ──────────────────────────────────────────────────────

    async pushFirstSync() {
        if (this._syncing) return;
        this._syncing = true;

        this.setSyncStatus('syncing');
        this._setSyncButtonState(true);

        try {
            // Sync events list from Firebase first (ensures all events are available)
            if (this.app?.eventManager?.initFromFirebase) {
                await this.app.eventManager.initFromFirebase();
            }

            const eid = this.app?.eventManager?.getActiveEventId();
            if (!eid) {
                this.setSyncStatus('synced');
                return;
            }

            await this._pushPhase(eid);
            await this._pullPhase(eid);
            this.setSyncStatus('synced');
        } catch (error) {
            console.error('[FirebaseSync] pushFirstSync failed:', error);
            this.setSyncStatus('failed');
        } finally {
            this._syncing = false;
            this._setSyncButtonState(false);
        }
    }

    // ─── Push Phase ─────────────────────────────────────────────────────────

    async _pushPhase(eventId) {
        const result = { matchesPushed: false, activePushed: false, registryPushed: false };

        // Flush retry queue first
        try {
            await this.flushRetryQueue();
        } catch (e) {
            console.warn('[FirebaseSync] Retry queue flush failed:', e);
        }

        // Push match history in batches of 500
        try {
            const localMatches = this._getLocalMatchHistory();
            if (localMatches && localMatches.length > 0) {
                const batchSize = 500;
                for (let i = 0; i < localMatches.length; i += batchSize) {
                    const batch = this.db.batch();
                    const chunk = localMatches.slice(i, i + batchSize);

                    for (const record of chunk) {
                        if (!record || record.id == null) continue;
                        const docRef = this.db.collection('events').doc(eventId).collection('matches').doc(String(record.id));
                        batch.set(docRef, { ...record, lastModified: Date.now() });
                    }

                    await batch.commit();
                }
            }
            result.matchesPushed = true;
        } catch (e) {
            console.error('[FirebaseSync] Push match history failed:', e);
        }

        // Push active match
        try {
            const localActive = this._getLocalActiveMatch();
            if (localActive) {
                await this.db.collection('events').doc(eventId).collection('appData').doc('activeMatch').set({
                    ...localActive,
                    lastModified: Date.now()
                });
            }
            result.activePushed = true;
        } catch (e) {
            console.error('[FirebaseSync] Push active match failed:', e);
        }

        // Push player registry
        try {
            const localPlayers = this._getLocalPlayerRegistry();
            if (localPlayers && localPlayers.length > 0) {
                await this.db.collection('events').doc(eventId).collection('playerRegistry').doc('data').set({
                    names: localPlayers,
                    lastModified: Date.now()
                });
            }
            result.registryPushed = true;
        } catch (e) {
            console.error('[FirebaseSync] Push player registry failed:', e);
        }

        return result;
    }

    // ─── Pull Phase ─────────────────────────────────────────────────────────

    async _pullPhase(eventId) {
        // Fetch all data from Firestore with a 5-second timeout
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Firestore fetch timeout')), 5000)
        );

        const fetchPromise = this._fetchFirestoreData(eventId);
        const remoteData = await Promise.race([fetchPromise, timeoutPromise]);

        // Overwrite localStorage match history
        const matchHistoryKey = this.app?.eventManager?.getMatchHistoryKey() || 'badminton-match-history';
        localStorage.setItem(matchHistoryKey, JSON.stringify(remoteData.matches || []));

        // Overwrite localStorage active match (or remove if null)
        const activeMatchKey = this.app?.eventManager?.getActiveMatchKey() || 'badminton-active-match';
        if (remoteData.activeMatch) {
            localStorage.setItem(activeMatchKey, JSON.stringify(remoteData.activeMatch));
        } else {
            localStorage.removeItem(activeMatchKey);
        }

        // Overwrite localStorage player registry
        const playerNamesKey = this.app?.eventManager?.getPlayerNamesKey() || 'badminton-player-names';
        localStorage.setItem(playerNamesKey, JSON.stringify(remoteData.players || []));

        // Post-sync UI refresh
        if (this.app) {
            if (typeof this.app.loadMatchHistory === 'function') {
                this.app.loadMatchHistory();
            }
            if (typeof this.app.loadPlayerNames === 'function') {
                this.app.loadPlayerNames();
            }
            if (typeof this.app.renderEventSelectors === 'function') {
                this.app.renderEventSelectors();
            }
            if (remoteData.activeMatch && typeof this.app.restoreActiveMatch === 'function') {
                this.app.restoreActiveMatch();
            }
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


if (typeof module !== 'undefined') module.exports = FirebaseSync;
