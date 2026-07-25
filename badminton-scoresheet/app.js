// Badminton Doubles Score Sheet App - Enhanced Edition

/**
 * Action_Entry Schema
 * Represents a single recorded player action (positive or negative).
 * {
 *   team: 'A' | 'B',              // Team of the player performing the action
 *   playerIndex: 0 | 1,           // Player index within the team
 *   playerName: string,           // Player display name
 *   actionType: string,           // One of: 'smash', 'drop', 'placed', 'net', 'out', 'service', 'unforced', 'carry'
 *   actionTypeLabel: string,      // Human-readable: "Smash", "Drop", "Placed", "Net fault", etc.
 *   category: 'positive' | 'negative', // "positive" for winning shots, "negative" for faults
 *   set: number,                  // Current set number (1-indexed)
 *   time: Date                    // Timestamp of recording
 * }
 *
 * Valid Action Types:
 *   Positive (winning shots): smash, drop, placed
 *   Negative (faults):        net, out, service, unforced, carry
 */

class BadmintonScoreSheet {
    constructor() {
        this.match = null;
        this.STORAGE_KEY = 'badminton-player-names';
        this.HISTORY_KEY = 'badminton-match-history';
        this.ACTIVE_MATCH_KEY = 'badminton-active-match';
        this.THEME_KEY = 'badminton-theme';
        this.servingTeam = 'A';
        this.lastFaultType = 'net';
        this.soundEnabled = true;

        // Valid action types for the performance scoring system
        this.VALID_ACTION_TYPES = ['smash', 'drop', 'placed', 'net', 'out', 'service', 'unforced', 'carry'];
        this.POSITIVE_ACTION_TYPES = ['smash', 'drop', 'placed'];
        this.NEGATIVE_ACTION_TYPES = ['net', 'out', 'service', 'unforced', 'carry'];

        // Initialize EventManager before other init calls
        this.eventManager = new EventManager(this);
        this.eventManager.init();

        // Initialize MemberManager after EventManager
        this.memberManager = new MemberManager(this);
        this.memberManager.init();

        this.initTheme();
        this.initVoice();
        this.initEventListeners();
        this.loadPlayerNames();
        this.initSounds();
        this.restoreActiveMatch();
        this.sync = typeof FirebaseSync !== 'undefined' ? new FirebaseSync(this) : null;

        // Render event selectors after sync init
        this.renderEventSelectors();
        this.populateMemberPickers();
    }

    // --- Event Management Integration ---
    onEventChanged() {
        this.memberManager?.onEventChanged();
        this.loadPlayerNames();
        this.restoreActiveMatch();
        this.renderEventSelectors();
        this.populateMemberPickers();
    }

    onEventListChanged() {
        this.renderEventSelectors();
        this.populateMemberPickers();
        this.renderEventsPage();
    }

    renderEventSelectors() {
        this.eventManager.renderEventSelector('event-selector-setup');
        this.eventManager.renderEventSelector('event-selector-history');
        this.eventManager.renderEventSelector('event-selector-leaderboard');
    }

    populateMemberPickers() {
        const names = this.memberManager ? this.memberManager.getMemberNames() : [];
        ['teamA-player1', 'teamA-player2', 'teamB-player1', 'teamB-player2'].forEach(id => {
            const select = document.getElementById(id);
            if (!select || select.tagName !== 'SELECT') return;
            const current = select.value;
            select.innerHTML = '<option value="">Select Player...</option>' +
                names.map(n => `<option value="${n}">${n}</option>`).join('') +
                '<option value="__new__">+ Type new name...</option>';
            if (current) select.value = current;
        });
    }

    renderEventsPage() {
        const events = this.eventManager.getEvents();
        const activeId = this.eventManager.getActiveEventId();
        const container = document.getElementById('event-list');
        if (!container) return;

        // Reset: show event list, hide members section
        container.classList.remove('hidden');
        document.querySelector('.event-add-form')?.classList.remove('hidden');
        document.getElementById('members-section')?.classList.add('hidden');

        container.innerHTML = events.map(event => {
            const date = new Date(event.createdDate).toLocaleDateString();
            const isActive = event.id === activeId;
            const badge = event.isDefault ? '<span class="event-card-badge">Default</span>' : '';
            return `<div class="event-card ${isActive ? 'active-event' : ''}" data-id="${event.id}">
                <div class="event-card-info">
                    <span class="event-card-name">${event.name}</span>
                    <span class="event-card-date">Created: ${date} ${badge}</span>
                </div>
                <div class="event-card-actions">
                    <button class="btn-members-event" data-id="${event.id}" title="Members">👥</button>
                    <button class="btn-rename-event" data-id="${event.id}" title="Rename">✏️</button>
                    <button class="btn-delete-event" data-id="${event.id}" title="Delete">🗑️</button>
                </div>
            </div>`;
        }).join('');

        // Attach event handlers
        container.querySelectorAll('.btn-rename-event').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const event = this.eventManager.getEventById(id);
                const newName = prompt('Rename event:', event.name);
                if (newName && newName.trim()) {
                    try {
                        this.eventManager.renameEvent(id, newName);
                    } catch(err) { alert(err.message); }
                }
            });
        });

        container.querySelectorAll('.btn-delete-event').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const event = this.eventManager.getEventById(id);
                if (confirm(`Delete event "${event.name}"?\n\nAll matches, players, and scores under this event will be permanently removed.`)) {
                    try {
                        this.eventManager.deleteEvent(id);
                        this.eventManager.deleteEventFromFirebase(id);
                    } catch(err) { alert(err.message); }
                }
            });
        });

        // Members button handler
        container.querySelectorAll('.btn-members-event').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const event = this.eventManager.getEventById(id);
                this.showMembersSection(id, event?.name || 'Members');
            });
        });
    }

    showMembersSection(eventId, eventName) {
        // Set this event as active if not already
        if (eventId !== this.eventManager.getActiveEventId()) {
            this.eventManager.setActiveEvent(eventId);
        }
        // Reload members for this event
        this.memberManager.onEventChanged();

        // Update title
        const title = document.getElementById('members-event-title');
        if (title) title.textContent = `Members - ${eventName}`;

        // Hide event list and add form, show members section
        document.getElementById('event-list').classList.add('hidden');
        document.querySelector('.event-add-form')?.classList.add('hidden');
        document.getElementById('members-section').classList.remove('hidden');

        // Render members
        this.memberManager.renderMembersPage();
    }

    // --- Theme ---
    initTheme() {
        const saved = localStorage.getItem(this.THEME_KEY) || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        this.updateThemeIcon(saved);
    }

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(this.THEME_KEY, next);
        this.updateThemeIcon(next);
    }

    updateThemeIcon(theme) {
        const btn = document.getElementById('btn-theme-toggle');
        btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }

    // --- Sound Effects ---
    initSounds() {
        this.audioCtx = null;
    }

    getAudioCtx() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audioCtx;
    }

    playScoreSound() {
        if (!this.soundEnabled) return;
        try {
            const ctx = this.getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } catch(e) {}
    }

    playErrorSound() {
        if (!this.soundEnabled) return;
        try {
            const ctx = this.getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 300;
            osc.type = 'square';
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.25);
        } catch(e) {}
    }

    playWinSound() {
        if (!this.soundEnabled) return;
        try {
            const ctx = this.getAudioCtx();
            const notes = [523, 659, 784, 1047];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.3);
                osc.start(ctx.currentTime + i * 0.15);
                osc.stop(ctx.currentTime + i * 0.15 + 0.3);
            });
        } catch(e) {}
    }

    // --- Voice Commands ---
    initVoice() {
        this.recognition = null;
        this.isListening = false;
        this.lastResultIndex = 0;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
            this.recognition.maxAlternatives = 3;

            this.recognition.onresult = (event) => {
                // Only process new results (avoid re-processing old ones)
                for (let i = this.lastResultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        const transcript = event.results[i][0].transcript.toLowerCase().trim();
                        const confidence = event.results[i][0].confidence;
                        this.processVoiceCommand(transcript, confidence);
                    }
                }
                this.lastResultIndex = event.results.length;
            };

            this.recognition.onend = () => {
                // Auto-restart if still in listening mode (keeps mic open)
                if (this.isListening) {
                    this.lastResultIndex = 0;
                    try { this.recognition.start(); } catch(e) {}
                } else {
                    document.getElementById('btn-voice-error').classList.remove('listening');
                    document.getElementById('btn-voice-error').textContent = '🎤 Voice Command';
                }
            };

            this.recognition.onerror = (event) => {
                if (event.error === 'no-speech' && this.isListening) return;
                if (event.error === 'aborted' && this.isListening) return;
                if (event.error === 'network') {
                    this.setVoiceStatus('Network error — check internet connection', 'error');
                    return;
                }
                this.isListening = false;
                document.getElementById('btn-voice-error').classList.remove('listening');
                document.getElementById('btn-voice-error').textContent = '🎤 Voice Command';
                this.setVoiceStatus(`Error: ${event.error}`, 'error');
            };
        }
    }

    toggleVoice() {
        if (!this.recognition) {
            this.setVoiceStatus('Speech recognition not supported in this browser', 'error');
            return;
        }
        if (!this.match) {
            this.setVoiceStatus('Start a match first before using voice commands', 'error');
            return;
        }
        if (this.isListening) {
            this.isListening = false;
            this.recognition.stop();
            document.getElementById('btn-voice-error').classList.remove('listening');
            document.getElementById('btn-voice-error').textContent = '🎤 Voice Command';
            document.getElementById('voice-help').classList.add('hidden');
            this.setVoiceStatus('Voice stopped', '');
        } else {
            this.lastResultIndex = 0;
            this.recognition.start();
            this.isListening = true;
            document.getElementById('btn-voice-error').classList.add('listening');
            document.getElementById('btn-voice-error').textContent = '⏹ Listening (tap to stop)';
            document.getElementById('voice-help').classList.remove('hidden');
            this.setVoiceStatus('Listening continuously... speak anytime', '');
        }
    }

    setVoiceStatus(msg, type) {
        const el = document.getElementById('voice-status');
        el.textContent = msg;
        el.className = 'voice-status' + (type ? ' ' + type : '');
        if (type) setTimeout(() => { el.textContent = ''; el.className = 'voice-status'; }, 4000);
    }

    processVoiceCommand(transcript, confidence) {
        this.setVoiceStatus(`Heard: "${transcript}" (${Math.round(confidence * 100)}%)`, '');

        if (!this.match || this.match.isFinished) {
            this.setVoiceStatus('No active match', 'error');
            return;
        }

        // Check for point commands: "point A", "point B", "score A", "score B"
        const pointMatch = transcript.match(/\b(point|score)\s*(a|b|team\s*a|team\s*b)\b/i);
        if (pointMatch) {
            const team = pointMatch[2].includes('a') ? 'A' : 'B';
            this.addPoint(team);
            this.setVoiceStatus(`✓ Point awarded to Team ${team}`, 'success');
            return;
        }

        // Quick shortcodes: A1, A2, B1, B2 + error type
        let team = null;
        let playerIndex = 0;
        let matchedPlayerName = null;

        // Match shortcodes like "a1", "a 1", "a one", "b2", "b two"
        const shortcodeMatch = transcript.match(/\b(a|b)\s*(1|2|one|two|won)\b/i);
        if (shortcodeMatch) {
            const teamLetter = shortcodeMatch[1].toLowerCase();
            const playerNum = shortcodeMatch[2];
            team = teamLetter === 'a' ? 'A' : 'B';
            playerIndex = (playerNum === '2' || playerNum === 'two') ? 1 : 0;
            const teamObj = team === 'A' ? this.match.teamA : this.match.teamB;
            matchedPlayerName = teamObj.players[playerIndex];
        }

        // Try to detect player name from transcript to auto-identify team (only if shortcode didn't match)
        if (!matchedPlayerName && this.match) {
            const allPlayers = [
                { name: this.match.teamA.players[0], team: 'A', index: 0 },
                { name: this.match.teamA.players[1], team: 'A', index: 1 },
                { name: this.match.teamB.players[0], team: 'B', index: 0 },
                { name: this.match.teamB.players[1], team: 'B', index: 1 }
            ];

            // Sort by name length descending to match longer names first
            allPlayers.sort((a, b) => b.name.length - a.name.length);

            // First pass: try full name match
            for (const p of allPlayers) {
                if (p.name && transcript.includes(p.name.toLowerCase())) {
                    team = p.team;
                    playerIndex = p.index;
                    matchedPlayerName = p.name;
                    break;
                }
            }

            // Second pass: try matching individual words in player names (first name or last name)
            if (!matchedPlayerName) {
                for (const p of allPlayers) {
                    if (!p.name) continue;
                    const nameParts = p.name.toLowerCase().split(/\s+/);
                    for (const part of nameParts) {
                        if (part.length >= 3 && transcript.includes(part)) {
                            team = p.team;
                            playerIndex = p.index;
                            matchedPlayerName = p.name;
                            break;
                        }
                    }
                    if (matchedPlayerName) break;
                }
            }
        }

        // Fallback: try explicit team mention if player name didn't match
        if (!team) {
            if (transcript.includes('team a')) team = 'A';
            else if (transcript.includes('team b')) team = 'B';
        }

        if (!team) {
            this.setVoiceStatus('❌ Not recognized. Try: "A1 net", "B2 out", or player name', 'error');
            return;
        }

        // Detect error type — ordered from most specific to least to avoid false matches
        const errorMap = [
            { key: 'service', keywords: ['service fault', 'serve fault', 'service', 'serve'] },
            { key: 'net', keywords: ['net fault', 'net'] },
            { key: 'double-hit', keywords: ['double hit', 'double'] },
            { key: 'unforced', keywords: ['unforced error', 'unforced'] },
            { key: 'out', keywords: ['shot out', ' out', 'out '] },
            { key: 'carry', keywords: ['carry', 'sling'] },
            { key: 'obstruction', keywords: ['obstruction', 'block'] },
            { key: 'other', keywords: ['fault', 'error', 'other'] }
        ];

        let detectedError = 'other';
        let detectedErrorLabel = 'Other';
        for (const entry of errorMap) {
            let found = false;
            for (const kw of entry.keywords) {
                if (transcript.includes(kw.trim())) {
                    detectedError = entry.key;
                    const opt = document.querySelector(`#error-type option[value="${entry.key}"]`);
                    detectedErrorLabel = opt ? opt.text : entry.key;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }

        // If team was found by explicit mention but player wasn't matched by name, check for "player 2"
        if (!matchedPlayerName) {
            const teamObj = team === 'A' ? this.match.teamA : this.match.teamB;
            if (transcript.includes('player 2') || transcript.includes('player two')) {
                playerIndex = 1;
            }
            matchedPlayerName = teamObj.players[playerIndex];
        }

        // Record action directly using new unified action system
        // Map detected error to action label
        const voiceActionLabelMap = {
            net: 'Net fault',
            out: 'Out',
            service: 'Service fault',
            unforced: 'Unforced error',
            carry: 'Carry',
            'double-hit': 'Carry',
            obstruction: 'Carry',
            other: 'Carry'
        };
        const voiceActionType = (detectedError === 'double-hit' || detectedError === 'obstruction' || detectedError === 'other') ? 'carry' : detectedError;
        const voiceLabel = voiceActionLabelMap[detectedError] || detectedErrorLabel;
        this.recordActionDirect(team, playerIndex, voiceActionType, voiceLabel, 'negative');

        // Also sync the dropdowns visually
        const teamSelect = document.getElementById('error-team');
        if (teamSelect) {
            teamSelect.value = team;
            teamSelect.dispatchEvent(new Event('change'));
        }
        const errorPlayerSelect = document.getElementById('error-player');
        if (errorPlayerSelect) errorPlayerSelect.value = String(playerIndex + 1);
        const errorTypeSelect = document.getElementById('error-type');
        if (errorTypeSelect) errorTypeSelect.value = detectedError;

        this.setVoiceStatus(`✓ ${voiceLabel} by ${matchedPlayerName} (Team ${team})`, 'success');
    }

    // --- Player Name Autocomplete ---
    getSavedPlayerNames() {
        try {
            const data = localStorage.getItem(this.eventManager.getPlayerNamesKey());
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    }

    savePlayerNames(names) {
        const existing = this.getSavedPlayerNames();
        const updated = [...new Set([...existing, ...names])].filter(n => n && n.trim());
        updated.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        localStorage.setItem(this.eventManager.getPlayerNamesKey(), JSON.stringify(updated));
        this.sync?.savePlayerRegistry(updated);
        this.loadPlayerNames();
    }

    loadPlayerNames() {
        const names = this.getSavedPlayerNames();
        const datalist = document.getElementById('player-names');
        if (datalist) {
            datalist.innerHTML = names.map(name => `<option value="${name}">`).join('');
        }
    }

    // --- Match History ---
    getMatchHistory() {
        try {
            const data = localStorage.getItem(this.eventManager.getMatchHistoryKey());
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    }

    saveMatchToHistory() {
        const history = this.getMatchHistory();
        const totalErrors = this.match.allErrors ? this.match.allErrors.length : 0;
        const totalActions = this.match.allActions ? this.match.allActions.length : 0;
        const record = {
            id: Date.now(),
            date: new Date().toISOString(),
            eventId: this.eventManager.getActiveEventId(),
            teamA: this.match.teamA,
            teamB: this.match.teamB,
            sets: this.match.sets.map(s => ({ scoreA: s.scoreA, scoreB: s.scoreB })),
            setsWon: this.match.setsWon,
            winner: this.match.winner,
            errors: totalErrors + totalActions,
            duration: this.getMatchDuration(),
            allActions: this.match.allActions || []
        };
        history.unshift(record);
        // Keep last 100 matches
        if (history.length > 100) history.pop();
        localStorage.setItem(this.eventManager.getMatchHistoryKey(), JSON.stringify(history));
        this.sync?.saveMatch(record);
    }

    // --- Event Listeners ---
    initEventListeners() {
        document.getElementById('start-match').addEventListener('click', () => this.startMatch());
        document.getElementById('record-match').addEventListener('click', () => this.showRecordMatchModal());
        document.getElementById('btn-confirm-record').addEventListener('click', () => this.confirmRecordMatch());
        document.getElementById('btn-cancel-record').addEventListener('click', () => this.hideRecordMatchModal());
        document.getElementById('btn-scoreA').addEventListener('click', () => this.addPoint('A'));
        document.getElementById('btn-scoreB').addEventListener('click', () => this.addPoint('B'));
        document.getElementById('btn-record-error').addEventListener('click', () => this.recordError());
        document.getElementById('btn-voice-error').addEventListener('click', () => this.toggleVoice());

        // Action icon buttons (per-player, one-tap action recording via event delegation)
        const actionIconsSection = document.querySelector('.action-icons-section');
        if (actionIconsSection) {
            actionIconsSection.addEventListener('click', (e) => {
                const btn = e.target.closest('.action-icon-btn');
                if (!btn) return;
                if (this.match && this.match.isFinished) return;

                const playerContainer = btn.closest('.action-icons-player');
                if (!playerContainer) return;

                const team = playerContainer.dataset.team;
                const playerIndex = parseInt(playerContainer.dataset.player);
                const actionType = btn.dataset.action;
                const category = btn.dataset.category;

                // Map data-action to human-readable label
                const actionLabelMap = {
                    smash: 'Smash',
                    drop: 'Drop',
                    placed: 'Placed',
                    net: 'Net fault',
                    out: 'Out',
                    service: 'Service fault',
                    unforced: 'Unforced error',
                    carry: 'Carry'
                };
                const label = actionLabelMap[actionType] || actionType;

                this.recordActionDirect(team, playerIndex, actionType, label, category);
            });
        }

        // Legacy fault buttons (guard in case still in DOM)
        document.querySelectorAll('.btn-fault').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const team = e.currentTarget.dataset.team;
                const playerIdx = parseInt(e.currentTarget.dataset.player);
                const faultSelect = document.getElementById('fault-type-select');
                if (!faultSelect) return;
                const errorType = faultSelect.value;
                const errorTypeLabel = faultSelect.selectedOptions[0].text;
                // Legacy: route through recordActionDirect as negative action
                const actionLabelMap = {
                    net: 'Net fault',
                    out: 'Out',
                    service: 'Service fault',
                    unforced: 'Unforced error',
                    carry: 'Carry'
                };
                const label = actionLabelMap[errorType] || errorTypeLabel;
                this.recordActionDirect(team, playerIdx, errorType, label, 'negative');
            });
        });

        // Fault type selector — track last used fault type (legacy, guard)
        const faultTypeSelect = document.getElementById('fault-type-select');
        if (faultTypeSelect) {
            faultTypeSelect.addEventListener('change', (e) => {
                this.lastFaultType = e.target.value;
            });
        }

        // Inline service toggle button
        const btnServiceToggle = document.getElementById('btn-service-toggle');
        if (btnServiceToggle) {
            btnServiceToggle.addEventListener('click', () => this.switchService());
        }

        // Undo button with visual feedback
        document.getElementById('btn-undo').addEventListener('click', () => {
            const btn = document.getElementById('btn-undo');
            btn.classList.add('undo-flash');
            setTimeout(() => btn.classList.remove('undo-flash'), 200);
            this.undoLast();
        });

        document.getElementById('btn-end-match').addEventListener('click', () => this.endMatch());
        document.getElementById('btn-new-match').addEventListener('click', () => this.newMatch());
        document.getElementById('btn-save-summary').addEventListener('click', () => this.saveSummary());
        document.getElementById('btn-share-card').addEventListener('click', () => this.generateShareCard());
        document.getElementById('btn-print').addEventListener('click', () => window.print());
        document.getElementById('btn-theme-toggle').addEventListener('click', () => this.toggleTheme());

        // Guard old #btn-switch-service (no longer in DOM)
        const btnSwitchService = document.getElementById('btn-switch-service');
        if (btnSwitchService) {
            btnSwitchService.addEventListener('click', () => this.switchService());
        }

        document.getElementById('btn-show-history').addEventListener('click', () => this.showHistoryPage());
        document.getElementById('btn-show-leaderboard').addEventListener('click', () => this.showLeaderboard());
        document.getElementById('btn-show-qr').addEventListener('click', () => this.showQRModal());
        document.getElementById('btn-close-qr').addEventListener('click', () => this.hideQRModal());

        // Manual Sync button
        const btnManualSync = document.getElementById('btn-manual-sync');
        if (btnManualSync) {
            btnManualSync.addEventListener('click', () => this.sync?.manualSync());
        }

        // History filters
        document.getElementById('history-search').addEventListener('input', () => this.renderHistoryPage());
        document.getElementById('history-date').addEventListener('change', () => this.renderHistoryPage());
        document.getElementById('btn-clear-filters').addEventListener('click', () => this.clearHistoryFilters());
        document.getElementById('btn-clear-history').addEventListener('click', () => this.clearHistory());
        document.getElementById('btn-select-all-history').addEventListener('click', () => this.toggleSelectAllHistory());
        document.getElementById('btn-export-history').addEventListener('click', () => this.exportSelectedHistory());
        document.getElementById('btn-import-history').addEventListener('change', (e) => this.importHistory(e));
        document.getElementById('btn-leaderboard-filter').addEventListener('click', () => this.renderLeaderboard());
        document.getElementById('btn-leaderboard-clear').addEventListener('click', () => this.clearLeaderboardFilters());
        document.getElementById('btn-print-leaderboard').addEventListener('click', () => this.printLeaderboard());

        // Window resize listener for sticky header height
        window.addEventListener('resize', () => this.updateStickyHeaderHeight());

        // Nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                const section = e.target.dataset.section;
                this.showSection(section);
                if (section === 'history-page') this.renderHistoryPage();
                if (section === 'leaderboard-page') this.renderLeaderboard();
                if (section === 'events-page') this.renderEventsPage();
            });
        });

        // Add Event button
        const btnAddEvent = document.getElementById('btn-add-event');
        if (btnAddEvent) {
            btnAddEvent.addEventListener('click', () => {
                const input = document.getElementById('event-name-input');
                const name = input.value.trim();
                if (!name) { alert('Please enter an event name.'); return; }
                try {
                    this.eventManager.createEvent(name);
                    input.value = '';
                } catch(err) { alert(err.message); }
            });
        }

        // Member picker toggle logic
        ['teamA-player1', 'teamA-player2', 'teamB-player1', 'teamB-player2'].forEach(id => {
            const select = document.getElementById(id);
            const input = document.getElementById(id + '-new');
            if (select && input) {
                select.addEventListener('change', () => {
                    if (select.value === '__new__') {
                        input.classList.remove('hidden');
                        input.focus();
                    } else {
                        input.classList.add('hidden');
                        input.value = '';
                    }
                });
            }
        });

        // Members section: Back button
        const btnBackToEvents = document.getElementById('btn-back-to-events');
        if (btnBackToEvents) {
            btnBackToEvents.addEventListener('click', () => {
                document.getElementById('members-section').classList.add('hidden');
                document.getElementById('event-list').classList.remove('hidden');
                document.querySelector('.event-add-form')?.classList.remove('hidden');
            });
        }

        // Members section: Add member button
        const btnAddMember = document.getElementById('btn-add-member');
        if (btnAddMember) {
            btnAddMember.addEventListener('click', () => {
                const input = document.getElementById('member-name-input');
                const name = input.value.trim();
                if (!name) { alert('Please enter a member name.'); return; }
                try {
                    this.memberManager.addMember(name);
                    input.value = '';
                    this.memberManager.renderMembersPage();
                    this.populateMemberPickers();
                } catch(err) { alert(err.message); }
            });
        }

        // Allow Enter key to add member
        const memberNameInput = document.getElementById('member-name-input');
        if (memberNameInput) {
            memberNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('btn-add-member')?.click();
                }
            });
        }
    }

    // --- Service Tracking ---
    switchService() {
        this.servingTeam = this.servingTeam === 'A' ? 'B' : 'A';
        this.updateServiceDisplay();
    }

    // --- Record Match (Quick Entry) ---
    showRecordMatchModal() {
        const getPlayerName = (selectId) => {
            const select = document.getElementById(selectId);
            if (select && select.tagName === 'SELECT') {
                if (select.value === '__new__') {
                    const input = document.getElementById(selectId + '-new');
                    return input ? input.value.trim() : '';
                }
                return select.value || '';
            }
            return select ? select.value.trim() : '';
        };
        const teamA1 = getPlayerName('teamA-player1') || 'Player A1';
        const teamA2 = getPlayerName('teamA-player2') || 'Player A2';
        const teamB1 = getPlayerName('teamB-player1') || 'Player B1';
        const teamB2 = getPlayerName('teamB-player2') || 'Player B2';

        if (!getPlayerName('teamA-player1') && !getPlayerName('teamA-player2') &&
            !getPlayerName('teamB-player1') && !getPlayerName('teamB-player2')) {
            alert('Please select at least the team players before recording.');
            return;
        }

        document.getElementById('record-teamA-label').textContent = `${teamA1} / ${teamA2}`;
        document.getElementById('record-teamB-label').textContent = `${teamB1} / ${teamB2}`;
        document.getElementById('record-scoreA').value = '21';
        document.getElementById('record-scoreB').value = '0';

        document.getElementById('record-match-modal').classList.remove('hidden');
    }

    hideRecordMatchModal() {
        document.getElementById('record-match-modal').classList.add('hidden');
    }

    confirmRecordMatch() {
        const scoreA = parseInt(document.getElementById('record-scoreA').value) || 0;
        const scoreB = parseInt(document.getElementById('record-scoreB').value) || 0;

        if (scoreA === 0 && scoreB === 0) {
            alert('Please enter valid scores.');
            return;
        }

        const getPlayerName = (selectId) => {
            const select = document.getElementById(selectId);
            if (select && select.tagName === 'SELECT') {
                if (select.value === '__new__') {
                    const input = document.getElementById(selectId + '-new');
                    return input ? input.value.trim() : '';
                }
                return select.value || '';
            }
            return select ? select.value.trim() : '';
        };
        const teamA1 = getPlayerName('teamA-player1') || 'Player A1';
        const teamA2 = getPlayerName('teamA-player2') || 'Player A2';
        const teamB1 = getPlayerName('teamB-player1') || 'Player B1';
        const teamB2 = getPlayerName('teamB-player2') || 'Player B2';

        this.memberManager?.autoAddMembers([teamA1, teamA2, teamB1, teamB2]);

        const winner = scoreA >= scoreB ? 'A' : 'B';

        const record = {
            id: Date.now(),
            date: new Date().toISOString(),
            teamA: { players: [teamA1, teamA2], name: `${teamA1} / ${teamA2}` },
            teamB: { players: [teamB1, teamB2], name: `${teamB1} / ${teamB2}` },
            sets: [{ scoreA: scoreA, scoreB: scoreB }],
            setsWon: { A: winner === 'A' ? 1 : 0, B: winner === 'B' ? 1 : 0 },
            winner: winner,
            errors: 0,
            duration: 'Recorded',
            eventId: this.eventManager?.getActiveEventId()
        };

        const history = this.getMatchHistory();
        history.unshift(record);
        if (history.length > 100) history.pop();
        localStorage.setItem(this.eventManager.getMatchHistoryKey(), JSON.stringify(history));

        this.sync?.saveMatch(record);

        this.hideRecordMatchModal();
        alert(`Match recorded! ${record.teamA.name} ${scoreA} - ${scoreB} ${record.teamB.name}`);
    }

    updateServiceDisplay() {
        const serviceTeamA = document.getElementById('service-team-a');
        const serviceTeamB = document.getElementById('service-team-b');
        if (serviceTeamA && serviceTeamB) {
            serviceTeamA.classList.toggle('serving', this.servingTeam === 'A');
            serviceTeamB.classList.toggle('serving', this.servingTeam === 'B');
            if (this.match) {
                // Update team name text while keeping shuttle icon
                serviceTeamA.innerHTML = `<span class="shuttle-icon">🏸</span> ${this.match.teamA.name}`;
                serviceTeamB.innerHTML = `${this.match.teamB.name} <span class="shuttle-icon">🏸</span>`;
            }
        }
    }

    // --- Active Match Persistence ---
    saveActiveMatch() {
        if (!this.match) return;
        const state = {
            match: this.match,
            servingTeam: this.servingTeam,
            lastFaultType: this.lastFaultType
        };
        try {
            localStorage.setItem(this.eventManager.getActiveMatchKey(), JSON.stringify(state));
            this.sync?.saveActiveMatch(state);
        } catch (e) {}
    }

    clearActiveMatch() {
        localStorage.removeItem(this.eventManager.getActiveMatchKey());
        this.sync?.clearActiveMatch();
    }

    restoreActiveMatch() {
        try {
            const data = localStorage.getItem(this.eventManager.getActiveMatchKey());
            if (!data) return;
            const state = JSON.parse(data);
            if (!state.match || state.match.isFinished) {
                this.clearActiveMatch();
                return;
            }
            this.match = state.match;
            this.servingTeam = state.servingTeam || 'A';
            this.lastFaultType = state.lastFaultType || 'net';
            // Restore dates as Date objects
            this.match.startTime = new Date(this.match.startTime);
            // Migrate old error format to new action format if needed
            this.migrateMatchData(this.match);
            // Restore UI
            this.updateErrorPlayerOptions();
            this.updateQuickErrorLabels();
            const faultTypeSelect = document.getElementById('fault-type-select');
            if (faultTypeSelect) faultTypeSelect.value = this.lastFaultType;
            this.updateServiceDisplay();
            this.showSection('scoreboard-section');
            this.updateDisplay();
            requestAnimationFrame(() => this.updateStickyHeaderHeight());
        } catch (e) {
            this.clearActiveMatch();
        }
    }

    /**
     * Migrates old match data from errors[]/allErrors[] format to actions[]/allActions[] format.
     * Old error entries are converted to action entries with category: "negative".
     * Already-migrated data (has allActions[]) is not re-migrated.
     * @param {object} match - The match object to migrate in place
     */
    migrateMatchData(match) {
        if (!match) return;

        // Don't migrate if already in new format (allActions exists and has data, or allErrors doesn't exist)
        if (match.allActions && match.allActions.length > 0) return;
        if (!match.allErrors && !match.sets?.some(s => s.errors && s.errors.length > 0)) return;

        // Error type to action type mapping
        const errorTypeToActionType = {
            net: 'net',
            out: 'out',
            service: 'service',
            unforced: 'unforced',
            other: 'carry'
        };

        // Migrate each set's errors[] to actions[]
        if (match.sets) {
            match.sets.forEach(set => {
                if (set.errors && set.errors.length > 0 && (!set.actions || set.actions.length === 0)) {
                    set.actions = set.errors.map(error => ({
                        team: error.team,
                        playerIndex: error.playerIndex,
                        playerName: error.playerName,
                        actionType: errorTypeToActionType[error.errorType] || error.errorType || 'carry',
                        actionTypeLabel: error.errorTypeLabel || error.errorType || 'Carry',
                        category: 'negative',
                        set: error.set,
                        time: error.time
                    }));
                }
                // Ensure actions array exists
                if (!set.actions) set.actions = [];

                // Migrate history entries: convert type: 'error' to type: 'action'
                if (set.history) {
                    set.history = set.history.map(entry => {
                        if (entry.type === 'error') {
                            return {
                                type: 'action',
                                team: entry.team,
                                actionTeam: entry.errorTeam,
                                playerName: entry.playerName,
                                actionType: entry.errorType || 'Carry',
                                category: 'negative',
                                scoreA: entry.scoreA,
                                scoreB: entry.scoreB,
                                time: entry.time
                            };
                        }
                        return entry;
                    });
                }
            });
        }

        // Migrate allErrors[] to allActions[]
        if (match.allErrors && match.allErrors.length > 0 && (!match.allActions || match.allActions.length === 0)) {
            match.allActions = match.allErrors.map(error => ({
                team: error.team,
                playerIndex: error.playerIndex,
                playerName: error.playerName,
                actionType: errorTypeToActionType[error.errorType] || error.errorType || 'carry',
                actionTypeLabel: error.errorTypeLabel || error.errorType || 'Carry',
                category: 'negative',
                set: error.set,
                time: error.time
            }));
        }

        // Ensure allActions array exists
        if (!match.allActions) match.allActions = [];
    }

    // --- Sticky Header Height ---
    updateStickyHeaderHeight() {
        const stickyHeader = document.getElementById('sticky-header');
        if (stickyHeader) {
            const height = stickyHeader.offsetHeight;
            document.documentElement.style.setProperty('--sticky-header-height', height + 'px');
        }
    }

    // --- Match Start ---
    startMatch() {
        const getPlayerName = (selectId) => {
            const select = document.getElementById(selectId);
            if (select && select.tagName === 'SELECT') {
                if (select.value === '__new__') {
                    const input = document.getElementById(selectId + '-new');
                    return input ? input.value.trim() : '';
                }
                return select.value || '';
            }
            // Fallback for non-select (shouldn't happen but safe)
            return select ? select.value.trim() : '';
        };
        const teamA1 = getPlayerName('teamA-player1') || 'Player A1';
        const teamA2 = getPlayerName('teamA-player2') || 'Player A2';
        const teamB1 = getPlayerName('teamB-player1') || 'Player B1';
        const teamB2 = getPlayerName('teamB-player2') || 'Player B2';
        const format = parseInt(document.getElementById('match-format').value);
        const pointsPerSet = parseInt(document.getElementById('points-per-set').value);

        this.memberManager?.autoAddMembers([teamA1, teamA2, teamB1, teamB2]);
        this.populateMemberPickers();

        this.match = {
            teamA: { players: [teamA1, teamA2], name: `${teamA1} / ${teamA2}` },
            teamB: { players: [teamB1, teamB2], name: `${teamB1} / ${teamB2}` },
            format, pointsPerSet,
            currentSet: 1,
            sets: [{ scoreA: 0, scoreB: 0, history: [], errors: [], actions: [] }],
            setsWon: { A: 0, B: 0 },
            allErrors: [],
            allActions: [],
            isFinished: false,
            startTime: new Date()
        };

        this.servingTeam = 'A';
        const teamANameEl = document.getElementById('teamA-name');
        const teamBNameEl = document.getElementById('teamB-name');
        if (teamANameEl) teamANameEl.textContent = this.match.teamA.name;
        if (teamBNameEl) teamBNameEl.textContent = this.match.teamB.name;
        this.updateErrorPlayerOptions();
        this.updateQuickErrorLabels();

        // Set fault type selector to last used fault type
        const faultTypeSelect = document.getElementById('fault-type-select');
        if (faultTypeSelect) {
            faultTypeSelect.value = this.lastFaultType;
        }

        this.updateServiceDisplay();
        this.showSection('scoreboard-section');
        this.updateDisplay();

        // Calculate sticky header height after rendering
        requestAnimationFrame(() => this.updateStickyHeaderHeight());
    }

    updateErrorPlayerOptions() {
        const teamSelect = document.getElementById('error-team');
        const playerSelect = document.getElementById('error-player');

        // Remove previous listener if exists
        if (this._errorTeamChangeHandler) {
            teamSelect.removeEventListener('change', this._errorTeamChangeHandler);
        }

        this._errorTeamChangeHandler = () => {
            const team = teamSelect.value === 'A' ? this.match.teamA : this.match.teamB;
            playerSelect.innerHTML = `
                <option value="1">${team.players[0]}</option>
                <option value="2">${team.players[1]}</option>`;
        };

        teamSelect.addEventListener('change', this._errorTeamChangeHandler);
        this._errorTeamChangeHandler();
    }

    updateQuickErrorLabels() {
        if (!this.match) return;
        // Update new per-player fault button labels (legacy)
        const faultA1 = document.getElementById('fault-a1');
        const faultA2 = document.getElementById('fault-a2');
        const faultB1 = document.getElementById('fault-b1');
        const faultB2 = document.getElementById('fault-b2');

        if (faultA1) faultA1.textContent = this.truncateLabel(this.match.teamA.players[0]);
        if (faultA2) faultA2.textContent = this.truncateLabel(this.match.teamA.players[1]);
        if (faultB1) faultB1.textContent = this.truncateLabel(this.match.teamB.players[0]);
        if (faultB2) faultB2.textContent = this.truncateLabel(this.match.teamB.players[1]);

        // Update action icon player name labels (new action-icons-section)
        const aiA1 = document.getElementById('action-player-a1-name');
        const aiA2 = document.getElementById('action-player-a2-name');
        const aiB1 = document.getElementById('action-player-b1-name');
        const aiB2 = document.getElementById('action-player-b2-name');
        if (aiA1) aiA1.textContent = this.truncateLabel(this.match.teamA.players[0]);
        if (aiA2) aiA2.textContent = this.truncateLabel(this.match.teamA.players[1]);
        if (aiB1) aiB1.textContent = this.truncateLabel(this.match.teamB.players[0]);
        if (aiB2) aiB2.textContent = this.truncateLabel(this.match.teamB.players[1]);

        // Also update old quick-error-names if still present (backward compatibility)
        const namesEl = document.getElementById('quick-error-names');
        if (namesEl) {
            namesEl.innerHTML = `<span class="qe-label-a"><strong>A1:</strong> ${this.match.teamA.players[0]}</span> &nbsp;|&nbsp; <span class="qe-label-a"><strong>A2:</strong> ${this.match.teamA.players[1]}</span> &nbsp;|&nbsp; <span class="qe-label-b"><strong>B1:</strong> ${this.match.teamB.players[0]}</span> &nbsp;|&nbsp; <span class="qe-label-b"><strong>B2:</strong> ${this.match.teamB.players[1]}</span>`;
        }
    }

    truncateLabel(name) {
        // Truncate player name for button display (max ~10 chars)
        if (!name) return '?';
        return name.length > 10 ? name.substring(0, 9) + '…' : name;
    }

    getCurrentSet() {
        return this.match.sets[this.match.currentSet - 1];
    }

    addPoint(team) {
        if (this.match.isFinished) return;
        const set = this.getCurrentSet();
        if (team === 'A') set.scoreA++;
        else set.scoreB++;

        set.history.push({
            type: 'point', team,
            scoreA: set.scoreA, scoreB: set.scoreB,
            time: new Date()
        });

        // Auto-switch service to the team that scored
        this.servingTeam = team;
        this.updateServiceDisplay();

        this.playScoreSound();
        this.animateScore(team);
        this.updateDisplay();
        this.checkSetEnd();
        this.saveActiveMatch();
    }

    animateScore(team) {
        const el = document.getElementById(team === 'A' ? 'scoreA' : 'scoreB');
        el.classList.remove('animate');
        void el.offsetWidth; // reflow
        el.classList.add('animate');
    }

    recordError() {
        if (!this.match || this.match.isFinished) return;
        const team = document.getElementById('error-team').value;
        const playerIndex = parseInt(document.getElementById('error-player').value) - 1;
        const errorType = document.getElementById('error-type').value;
        const errorTypeLabel = document.getElementById('error-type').selectedOptions[0].text;
        // Route through unified action system as a negative action
        const actionLabelMap = {
            net: 'Net fault',
            out: 'Out',
            service: 'Service fault',
            unforced: 'Unforced error',
            carry: 'Carry'
        };
        const label = actionLabelMap[errorType] || errorTypeLabel;
        this.recordActionDirect(team, playerIndex, errorType, label, 'negative');
    }

    /**
     * @deprecated Use recordActionDirect instead. Kept for backward compatibility with voice commands.
     */
    recordErrorDirect(team, playerIndex, errorType, errorTypeLabel) {
        // Map legacy error types to action types
        const legacyTypeMap = {
            'double-hit': 'carry',
            'obstruction': 'carry',
            'other': 'carry'
        };
        const actionType = legacyTypeMap[errorType] || errorType;
        const actionLabelMap = {
            net: 'Net fault',
            out: 'Out',
            service: 'Service fault',
            unforced: 'Unforced error',
            carry: 'Carry'
        };
        const label = actionLabelMap[actionType] || errorTypeLabel;
        this.recordActionDirect(team, playerIndex, actionType, label, 'negative');
    }

    /**
     * Records a player action (positive or negative) and updates score.
     * @param {string} team - 'A' or 'B'
     * @param {number} playerIndex - 0 or 1
     * @param {string} actionType - One of: smash, drop, placed, net, out, service, unforced, carry
     * @param {string} actionTypeLabel - Human-readable label (e.g., "Smash", "Net fault")
     * @param {string} category - "positive" or "negative"
     */
    recordActionDirect(team, playerIndex, actionType, actionTypeLabel, category) {
        if (this.match.isFinished) return;

        const teamObj = team === 'A' ? this.match.teamA : this.match.teamB;
        const playerName = teamObj.players[playerIndex];

        // Build Action_Entry object
        const actionEntry = {
            team,
            playerIndex,
            playerName,
            actionType,
            actionTypeLabel,
            category,
            set: this.match.currentSet,
            time: new Date()
        };

        const set = this.getCurrentSet();

        // Push to actions arrays
        set.actions.push(actionEntry);
        this.match.allActions.push(actionEntry);

        // Determine which team gains the point
        let scoringTeam;
        if (category === 'positive') {
            // Positive action: point goes to the acting team
            scoringTeam = team;
        } else {
            // Negative action: point goes to the opposing team
            scoringTeam = team === 'A' ? 'B' : 'A';
        }

        // Increment the scoring team's score
        if (scoringTeam === 'A') set.scoreA++;
        else set.scoreB++;

        // Push history entry
        set.history.push({
            type: 'action',
            team: scoringTeam,
            actionTeam: team,
            playerName,
            actionType: actionTypeLabel,
            category,
            scoreA: set.scoreA,
            scoreB: set.scoreB,
            time: new Date()
        });

        // Voice announcement for the action (pass scoringTeam for correct score order)
        this.announceAction(team, playerName, actionTypeLabel, category, scoringTeam);

        // Transfer service to the team that gained the point
        this.servingTeam = scoringTeam;
        this.updateServiceDisplay();

        this.saveActiveMatch();
        this.updateDisplay();
        this.checkSetEnd();
    }

    // --- Voice Announcement (Text-to-Speech) ---

    /**
     * Speaks the action via TTS.
     * Positive format: "{Team Name}, {Player Name}, {Action Type}!"
     * Negative format: "{Team Name}, {Player Name}, {Action Type}"
     * @param {string} team - 'A' or 'B'
     * @param {string} playerName
     * @param {string} actionTypeLabel
     * @param {string} category - "positive" or "negative"
     */
    announceAction(team, playerName, actionTypeLabel, category, scoringTeam) {
        if (!window.speechSynthesis) return;
        // Voice format: "{Player Name}, {Action Type}" — no team name
        let text;
        if (category === 'positive') {
            text = `${playerName}, ${actionTypeLabel}!`;
        } else {
            text = `${playerName}, ${actionTypeLabel}`;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        utterance.lang = 'en-US';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);

        // After a brief pause, announce the current score (scoring team's score first)
        this.announceScore(scoringTeam);
    }

    /**
     * Announces the current match score via TTS.
     * The team that just scored gets their score announced first, then the opponent's score.
     * - Positive action by Team A: Team A scored → A's score first, B's score second
     * - Negative action by Team A: Team B scored → B's score first, A's score second
     * @param {string} scoringTeam - 'A' or 'B' — the team that just gained the point
     */
    announceScore(scoringTeam) {
        if (!window.speechSynthesis) return;
        const set = this.getCurrentSet();
        let firstScore, secondScore;
        if (scoringTeam === 'A') {
            firstScore = set.scoreA;
            secondScore = set.scoreB;
        } else {
            firstScore = set.scoreB;
            secondScore = set.scoreA;
        }
        // Scoring team's score first, then opponent's score
        const scoreText = `${firstScore} ... ${secondScore}`;
        const scoreUtterance = new SpeechSynthesisUtterance(scoreText);
        scoreUtterance.rate = 1.0;
        scoreUtterance.pitch = 1.0;
        scoreUtterance.volume = 0.8;
        scoreUtterance.lang = 'en-US';
        // Queue after the action announcement (don't cancel — it queues automatically)
        window.speechSynthesis.speak(scoreUtterance);
    }

    undoLast() {
        const set = this.getCurrentSet();
        if (set.history.length === 0) return;
        const lastEntry = set.history.pop();

        // Handle new 'action' type history entries
        if (lastEntry.type === 'action') {
            // Remove from actions arrays
            if (set.actions && set.actions.length > 0) set.actions.pop();
            if (this.match.allActions && this.match.allActions.length > 0) this.match.allActions.pop();

            // Reverse the score based on category
            if (lastEntry.category === 'positive') {
                // Positive action: the acting team (actionTeam) scored, so decrease their score
                if (lastEntry.actionTeam === 'A') set.scoreA--;
                else set.scoreB--;
            } else if (lastEntry.category === 'negative') {
                // Negative action: the opposing team (team field = scoring team) scored
                if (lastEntry.team === 'A') set.scoreA--;
                else set.scoreB--;
            }
        }
        // Handle legacy 'error' type history entries (backward compatibility)
        else if (lastEntry.type === 'error') {
            if (set.errors && set.errors.length > 0) set.errors.pop();
            if (this.match.allErrors && this.match.allErrors.length > 0) this.match.allErrors.pop();
            // Restore scores from previous history entry
            if (set.history.length > 0) {
                const prev = set.history[set.history.length - 1];
                set.scoreA = prev.scoreA; set.scoreB = prev.scoreB;
            } else { set.scoreA = 0; set.scoreB = 0; }
        }
        // Fallback for any other type (e.g., plain score entries)
        else {
            if (set.history.length > 0) {
                const prev = set.history[set.history.length - 1];
                set.scoreA = prev.scoreA; set.scoreB = prev.scoreB;
            } else { set.scoreA = 0; set.scoreB = 0; }
        }

        this.saveActiveMatch();
        this.updateDisplay();
    }

    checkSetEnd() {
        const set = this.getCurrentSet();
        const target = this.match.pointsPerSet;
        let setWon = false, winner = null;

        if (set.scoreA >= target && set.scoreA - set.scoreB >= 2) { setWon = true; winner = 'A'; }
        else if (set.scoreB >= target && set.scoreB - set.scoreA >= 2) { setWon = true; winner = 'B'; }
        else if (set.scoreA === 30 || set.scoreB === 30) { setWon = true; winner = set.scoreA >= set.scoreB ? 'A' : 'B'; }

        if (setWon) {
            this.match.setsWon[winner]++;
            const setsToWin = Math.ceil(this.match.format / 2);
            if (this.match.setsWon[winner] >= setsToWin) {
                this.match.isFinished = true;
                this.match.winner = winner;
                this.match.endTime = new Date();
                this.playWinSound();
                this.saveMatchToHistory();
                this.clearActiveMatch();
                setTimeout(() => this.showSummary(), 500);
            } else {
                this.match.currentSet++;
                this.match.sets.push({ scoreA: 0, scoreB: 0, history: [], errors: [], actions: [] });
                this.servingTeam = 'A';
                this.updateServiceDisplay();
                this.updateDisplay();
            }
        }
    }

    updateDisplay() {
        const set = this.getCurrentSet();
        document.getElementById('scoreA').textContent = set.scoreA;
        document.getElementById('scoreB').textContent = set.scoreB;

        // Update set info in compact format for new sticky header
        const setInfo = document.getElementById('set-info');
        if (setInfo) {
            const setsWonStr = `${this.match.setsWon.A}-${this.match.setsWon.B}`;
            setInfo.textContent = `Set ${this.match.currentSet} (${setsWonStr})`;
        }

        // Legacy set display (if still in DOM)
        const currentSetEl = document.getElementById('current-set');
        if (currentSetEl) {
            currentSetEl.textContent = `Set ${this.match.currentSet}`;
        }

        const setScoresArr = [];
        for (let i = 0; i < this.match.sets.length - 1; i++) {
            const s = this.match.sets[i];
            setScoresArr.push(`${s.scoreA}-${s.scoreB}`);
        }
        const setScoresEl = document.getElementById('set-scores');
        if (setScoresEl) {
            setScoresEl.textContent = setScoresArr.length > 0 ? `(${setScoresArr.join(', ')})` : '';
        }

        // Update undo button disabled state
        const btnUndo = document.getElementById('btn-undo');
        if (btnUndo) {
            btnUndo.disabled = set.history.length === 0;
        }

        this.updateServiceDisplay();
        this.renderHistory();
        this.updateLivePerformance();
    }

    updateLivePerformance() {
        if (!this.match || !this.match.allActions) return;

        const players = [
            { id: 'live-perf-a1', team: 'A', index: 0 },
            { id: 'live-perf-a2', team: 'A', index: 1 },
            { id: 'live-perf-b1', team: 'B', index: 0 },
            { id: 'live-perf-b2', team: 'B', index: 1 }
        ];

        players.forEach(p => {
            const el = document.getElementById(p.id);
            if (!el) return;

            const actions = this.match.allActions.filter(
                a => a.team === p.team && a.playerIndex === p.index
            );
            const pos = actions.filter(a => a.category === 'positive').length;
            const neg = actions.filter(a => a.category === 'negative').length;

            el.textContent = `+${pos} / -${neg}`;
            el.classList.toggle('has-positive', pos > 0);
            el.classList.toggle('has-negative', neg > 0);
        });
    }

    renderHistory() {
        const set = this.getCurrentSet();
        const container = document.getElementById('point-history');
        container.innerHTML = '';
        set.history.slice().reverse().forEach(entry => {
            const div = document.createElement('div');
            const time = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (entry.type === 'action') {
                if (entry.category === 'positive') {
                    div.className = 'point-entry team-' + entry.team.toLowerCase();
                    div.innerHTML = `<span>🏆 ${entry.actionType} by ${entry.playerName} → Point to Team ${entry.team}</span><span class="timestamp">${entry.scoreA}-${entry.scoreB} | ${time}</span>`;
                } else {
                    div.className = 'point-entry error';
                    div.innerHTML = `<span>⚠️ ${entry.actionType} by ${entry.playerName} → Point to Team ${entry.team}</span><span class="timestamp">${entry.scoreA}-${entry.scoreB} | ${time}</span>`;
                }
            } else if (entry.type === 'error') {
                // Legacy format (backward compat for old matches)
                div.className = 'point-entry error';
                div.innerHTML = `<span>⚠️ ${entry.errorType} by ${entry.playerName} → Point to Team ${entry.team}</span><span class="timestamp">${entry.scoreA}-${entry.scoreB} | ${time}</span>`;
            } else {
                div.className = `point-entry team-${entry.team.toLowerCase()}`;
                const teamName = entry.team === 'A' ? this.match.teamA.name : this.match.teamB.name;
                div.innerHTML = `<span>✓ Point to ${teamName}</span><span class="timestamp">${entry.scoreA}-${entry.scoreB} | ${time}</span>`;
            }
            container.appendChild(div);
        });
    }

    endMatch() {
        if (confirm('End match early? The current score will be used for the summary.')) {
            this.match.isFinished = true;
            this.match.endTime = new Date();
            if (this.match.setsWon.A > this.match.setsWon.B) this.match.winner = 'A';
            else if (this.match.setsWon.B > this.match.setsWon.A) this.match.winner = 'B';
            else {
                const set = this.getCurrentSet();
                this.match.winner = set.scoreA >= set.scoreB ? 'A' : 'B';
            }
            this.saveMatchToHistory();
            this.clearActiveMatch();
            this.showSummary();
        }
    }

    showSummary() {
        this.showSection('summary-section');
        const winnerTeam = this.match.winner === 'A' ? this.match.teamA : this.match.teamB;
        const loserTeam = this.match.winner === 'A' ? this.match.teamB : this.match.teamA;

        document.getElementById('match-result').innerHTML = `
            <h2>🏆 ${winnerTeam.name}</h2>
            <p>defeats ${loserTeam.name}</p>
            <p style="margin-top:8px; color:var(--text-faint);">
                Sets: ${this.match.setsWon.A} - ${this.match.setsWon.B} | Duration: ${this.getMatchDuration()}
            </p>`;

        let setHTML = '<table><tr><th>Set</th><th>Team A</th><th>Team B</th></tr>';
        this.match.sets.forEach((set, i) => { setHTML += `<tr><td>Set ${i+1}</td><td>${set.scoreA}</td><td>${set.scoreB}</td></tr>`; });
        setHTML += '</table>';
        document.getElementById('set-results').innerHTML = setHTML;

        // Build per-player performance summary from allActions
        // Layout: players as ROWS, action types as COLUMNS (vertically-texted headers)
        // Color-coded: green columns for positive, red columns for negative
        // Summary column at the end for each player's totals
        const players = [
            { name: this.match.teamA.players[0], team: 'A', index: 0 },
            { name: this.match.teamA.players[1], team: 'A', index: 1 },
            { name: this.match.teamB.players[0], team: 'B', index: 0 },
            { name: this.match.teamB.players[1], team: 'B', index: 1 }
        ];

        const positiveTypes = [
            { key: 'smash', label: 'Smash' },
            { key: 'drop', label: 'Drop' },
            { key: 'placed', label: 'Placed' }
        ];
        const negativeTypes = [
            { key: 'net', label: 'Net' },
            { key: 'out', label: 'Out' },
            { key: 'service', label: 'Svc' },
            { key: 'unforced', label: 'UF' },
            { key: 'carry', label: 'Carry' }
        ];

        // Compute counts per player
        const playerCounts = players.map(player => {
            const actions = this.match.allActions.filter(
                a => a.team === player.team && a.playerIndex === player.index
            );
            const counts = {};
            actions.forEach(a => { counts[a.actionType] = (counts[a.actionType] || 0) + 1; });
            const totalPositive = positiveTypes.reduce((sum, t) => sum + (counts[t.key] || 0), 0);
            const totalNegative = negativeTypes.reduce((sum, t) => sum + (counts[t.key] || 0), 0);
            return { ...player, counts, totalPositive, totalNegative };
        });

        let perfHTML = '';
        if (!this.match.allActions.length) {
            perfHTML = '<p>No actions recorded</p>';
        } else {
            perfHTML = `<div class="perf-table-wrapper"><table class="perf-table">`;

            // Header row: Player | positive columns... | +Total | negative columns... | -Total
            // Labels are rendered vertically (bottom-to-top) using .perf-vertical span
            perfHTML += `<thead><tr>`;
            perfHTML += `<th class="perf-player-header">Player</th>`;
            positiveTypes.forEach(t => {
                perfHTML += `<th class="perf-col-positive"><span class="perf-vertical">${t.label}</span></th>`;
            });
            perfHTML += `<th class="perf-col-positive perf-col-total"><span class="perf-vertical">+</span></th>`;
            negativeTypes.forEach(t => {
                perfHTML += `<th class="perf-col-negative"><span class="perf-vertical">${t.label}</span></th>`;
            });
            perfHTML += `<th class="perf-col-negative perf-col-total"><span class="perf-vertical">-</span></th>`;
            perfHTML += `</tr></thead>`;

            // Body: one row per player
            perfHTML += `<tbody>`;
            playerCounts.forEach(p => {
                perfHTML += `<tr>`;
                perfHTML += `<td class="perf-player-name">${p.name}</td>`;
                positiveTypes.forEach(t => {
                    const val = p.counts[t.key] || 0;
                    perfHTML += `<td class="perf-cell perf-cell-positive">${val || '-'}</td>`;
                });
                perfHTML += `<td class="perf-cell perf-cell-positive perf-cell-total"><strong>${p.totalPositive}</strong></td>`;
                negativeTypes.forEach(t => {
                    const val = p.counts[t.key] || 0;
                    perfHTML += `<td class="perf-cell perf-cell-negative">${val || '-'}</td>`;
                });
                perfHTML += `<td class="perf-cell perf-cell-negative perf-cell-total"><strong>${p.totalNegative}</strong></td>`;
                perfHTML += `</tr>`;
            });

            // Summary row: totals across all players
            perfHTML += `<tr class="perf-summary-row">`;
            perfHTML += `<td class="perf-player-name"><strong>All</strong></td>`;
            positiveTypes.forEach(t => {
                const total = playerCounts.reduce((sum, p) => sum + (p.counts[t.key] || 0), 0);
                perfHTML += `<td class="perf-cell perf-cell-positive"><strong>${total}</strong></td>`;
            });
            const grandPositive = playerCounts.reduce((sum, p) => sum + p.totalPositive, 0);
            perfHTML += `<td class="perf-cell perf-cell-positive perf-cell-total"><strong>${grandPositive}</strong></td>`;
            negativeTypes.forEach(t => {
                const total = playerCounts.reduce((sum, p) => sum + (p.counts[t.key] || 0), 0);
                perfHTML += `<td class="perf-cell perf-cell-negative"><strong>${total}</strong></td>`;
            });
            const grandNegative = playerCounts.reduce((sum, p) => sum + p.totalNegative, 0);
            perfHTML += `<td class="perf-cell perf-cell-negative perf-cell-total"><strong>${grandNegative}</strong></td>`;
            perfHTML += `</tr>`;

            perfHTML += `</tbody></table></div>`;
        }

        document.getElementById('performance-summary').innerHTML = perfHTML;
    }

    getMatchDuration() {
        if (!this.match.startTime || !this.match.endTime) return 'N/A';
        const diff = this.match.endTime - this.match.startTime;
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    saveSummary() {
        const winnerTeam = this.match.winner === 'A' ? this.match.teamA : this.match.teamB;
        const loserTeam = this.match.winner === 'A' ? this.match.teamB : this.match.teamA;
        const date = new Date().toLocaleDateString();
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let text = '═══════════════════════════════════════════\n';
        text += '       BADMINTON DOUBLES - MATCH SUMMARY\n';
        text += '═══════════════════════════════════════════\n';
        text += `Date: ${date}  |  Time: ${time}\n`;
        text += `Duration: ${this.getMatchDuration()}\n\n`;
        text += `🏆 WINNER: ${winnerTeam.name}\n`;
        text += `   defeated ${loserTeam.name}\n`;
        text += `   Sets: ${this.match.setsWon.A} - ${this.match.setsWon.B}\n\n`;
        text += '───────────────────────────────────────────\n SET RESULTS\n───────────────────────────────────────────\n';
        text += `  ${'Set'.padEnd(8)}${'Team A'.padEnd(10)}Team B\n`;
        this.match.sets.forEach((set, i) => { text += `  ${('Set '+(i+1)).padEnd(8)}${String(set.scoreA).padEnd(10)}${set.scoreB}\n`; });

        const errorsA = (this.match.allErrors || []).filter(e => e.team === 'A').length;
        const errorsB = (this.match.allErrors || []).filter(e => e.team === 'B').length;
        const actionsA = (this.match.allActions || []).filter(a => a.team === 'A');
        const actionsB = (this.match.allActions || []).filter(a => a.team === 'B');
        const positiveA = actionsA.filter(a => a.category === 'positive').length;
        const negativeA = actionsA.filter(a => a.category === 'negative').length;
        const positiveB = actionsB.filter(a => a.category === 'positive').length;
        const negativeB = actionsB.filter(a => a.category === 'negative').length;
        text += `\n───────────────────────────────────────────\n PERFORMANCE SUMMARY\n───────────────────────────────────────────\n`;
        text += `  ${this.match.teamA.name}: ${positiveA} winning shots, ${negativeA + errorsA} faults\n`;
        text += `  ${this.match.teamB.name}: ${positiveB} winning shots, ${negativeB + errorsB} faults\n`;
        text += `  Total actions: ${actionsA.length + actionsB.length + errorsA + errorsB}\n`;
        text += '═══════════════════════════════════════════\n';

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `match-summary_${date.replace(/\//g,'-')}_${time.replace(/:/g,'')}.txt`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- Share Card (Canvas Image) ---
    generateShareCard() {
        const canvas = document.getElementById('share-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 600;
        canvas.height = 400;

        // Background
        const grad = ctx.createLinearGradient(0, 0, 600, 400);
        grad.addColorStop(0, '#1a1a2e');
        grad.addColorStop(1, '#0f3460');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 600, 400);

        // Border
        ctx.strokeStyle = '#64ffda';
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, 580, 380);

        // Title
        ctx.fillStyle = '#64ffda';
        ctx.font = 'bold 22px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('🏸 SPARK Badminton', 300, 50);

        // Winner
        const winnerTeam = this.match.winner === 'A' ? this.match.teamA : this.match.teamB;
        const loserTeam = this.match.winner === 'A' ? this.match.teamB : this.match.teamA;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Segoe UI';
        ctx.fillText(`🏆 ${winnerTeam.name}`, 300, 100);
        ctx.fillStyle = '#b0bec5';
        ctx.font = '16px Segoe UI';
        ctx.fillText(`defeats ${loserTeam.name}`, 300, 130);

        // Score
        ctx.fillStyle = '#ffab40';
        ctx.font = 'bold 18px Segoe UI';
        ctx.fillText(`Sets: ${this.match.setsWon.A} - ${this.match.setsWon.B}`, 300, 170);

        // Set details
        ctx.fillStyle = '#e0e0e0';
        ctx.font = '14px Segoe UI';
        this.match.sets.forEach((set, i) => {
            ctx.fillText(`Set ${i+1}: ${set.scoreA} - ${set.scoreB}`, 300, 210 + i * 28);
        });

        // Date & Duration
        ctx.fillStyle = '#78909c';
        ctx.font = '13px Segoe UI';
        ctx.fillText(`${new Date().toLocaleDateString()} | Duration: ${this.getMatchDuration()}`, 300, 350);

        // Performance
        const totalActions = (this.match.allActions || []).length;
        const totalErrors = (this.match.allErrors || []).length;
        ctx.fillText(`Total Actions: ${totalActions + totalErrors}`, 300, 375);

        // Show preview and download link
        const dataUrl = canvas.toDataURL('image/png');
        const preview = document.getElementById('share-preview');
        preview.classList.remove('hidden');
        preview.innerHTML = `
            <img src="${dataUrl}" alt="Match Card">
            <p style="margin-top:12px;">
                <a href="${dataUrl}" download="match-card.png" class="btn btn-primary btn-sm">⬇ Download Image</a>
            </p>`;
    }

    // --- History Page ---
    showHistoryPage() {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-section="history-page"]').classList.add('active');
        this.showSection('history-page');
        this.renderHistoryPage();
    }

    renderHistoryPage() {
        const history = this.getMatchHistory();
        const search = document.getElementById('history-search').value.toLowerCase();
        const dateFilter = document.getElementById('history-date').value;
        const container = document.getElementById('history-list');

        const filtered = history.filter(m => {
            const players = [...m.teamA.players, ...m.teamB.players].join(' ').toLowerCase();
            const matchDate = m.date.split('T')[0];
            if (search && !players.includes(search)) return false;
            if (dateFilter && matchDate !== dateFilter) return false;
            return true;
        });

        if (filtered.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;">No matches found.</p>';
            return;
        }

        container.innerHTML = filtered.map(m => {
            const date = new Date(m.date).toLocaleDateString();
            const time = new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const winnerName = m.winner === 'A' ? m.teamA.name : m.teamB.name;
            const scores = m.sets.map(s => `${s.scoreA}-${s.scoreB}`).join(', ');
            return `<div class="history-item">
                <div class="history-item-header">
                    <label class="history-checkbox"><input type="checkbox" class="match-select" data-id="${m.id}"></label>
                    <div class="match-date">${date} ${time} | Duration: ${m.duration}</div>
                    <button class="btn-delete-match" data-id="${m.id}" title="Delete this match">✕</button>
                </div>
                <div class="match-teams">${m.teamA.name} vs ${m.teamB.name}</div>
                <div class="match-score">Sets: ${m.setsWon.A}-${m.setsWon.B} (${scores})</div>
                <div class="match-winner">🏆 Winner: ${winnerName}</div>
            </div>`;
        }).join('');

        // Attach delete handlers
        container.querySelectorAll('.btn-delete-match').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.target.dataset.id);
                this.deleteMatchFromHistory(id);
            });
        });
    }

    deleteMatchFromHistory(id) {
        if (!confirm('Delete this match from history?')) return;
        let history = this.getMatchHistory();
        history = history.filter(m => m.id !== id);
        localStorage.setItem(this.eventManager.getMatchHistoryKey(), JSON.stringify(history));

        // Also delete from Firebase so it doesn't come back on merge
        const eventId = this.eventManager?.getActiveEventId();
        if (eventId && this.sync?.available && this.sync?.db) {
            this.sync.db.collection('events').doc(eventId)
                .collection('matches').doc(String(id)).delete()
                .catch(e => console.warn('[App] Failed to delete match from Firebase:', e));
        }

        this.renderHistoryPage();
    }

    clearHistoryFilters() {
        document.getElementById('history-search').value = '';
        document.getElementById('history-date').value = '';
        this.renderHistoryPage();
    }

    clearHistory() {
        if (confirm('Delete all match history? This cannot be undone.')) {
            // Delete all matches from Firebase for this event
            const eventId = this.eventManager?.getActiveEventId();
            if (eventId && this.sync?.available && this.sync?.db) {
                this.sync.db.collection('events').doc(eventId)
                    .collection('matches').get()
                    .then(snapshot => {
                        const batch = this.sync.db.batch();
                        snapshot.forEach(doc => batch.delete(doc.ref));
                        return batch.commit();
                    })
                    .catch(e => console.warn('[App] Failed to clear matches from Firebase:', e));
            }

            localStorage.removeItem(this.eventManager.getMatchHistoryKey());
            this.renderHistoryPage();
        }
    }

    toggleSelectAllHistory() {
        const checkboxes = document.querySelectorAll('.match-select');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
    }

    exportSelectedHistory() {
        const selectedIds = Array.from(document.querySelectorAll('.match-select:checked'))
            .map(cb => parseInt(cb.dataset.id));

        if (selectedIds.length === 0) {
            alert('Please select at least one match to export.');
            return;
        }

        const history = this.getMatchHistory();
        const selected = history.filter(m => selectedIds.includes(m.id));

        const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `badminton-history_${date}_${selected.length}matches.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    importHistory(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) {
                    alert('Invalid file format. Expected a JSON array of matches.');
                    return;
                }

                const history = this.getMatchHistory();
                const existingIds = new Set(history.map(m => m.id));
                let added = 0;

                imported.forEach(m => {
                    if (!existingIds.has(m.id)) {
                        history.push(m);
                        added++;
                    }
                });

                // Sort by date descending
                history.sort((a, b) => new Date(b.date) - new Date(a.date));
                localStorage.setItem(this.eventManager.getMatchHistoryKey(), JSON.stringify(history));
                this.renderHistoryPage();
                alert(`Imported ${added} new match(es). ${imported.length - added} duplicate(s) skipped.`);
            } catch (err) {
                alert('Error reading file. Please ensure it is a valid JSON export.');
            }
        };
        reader.readAsText(file);
        // Reset input so same file can be imported again
        event.target.value = '';
    }

    // --- Leaderboard ---
    showLeaderboard() {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-section="leaderboard-page"]').classList.add('active');
        this.showSection('leaderboard-page');
        this.renderLeaderboard();
    }

    renderLeaderboard() {
        const history = this.getMatchHistory();
        const fromDate = document.getElementById('leaderboard-from').value;
        const toDate = document.getElementById('leaderboard-to').value;

        const filtered = history.filter(m => {
            const matchDate = m.date.split('T')[0];
            if (fromDate && matchDate < fromDate) return false;
            if (toDate && matchDate > toDate) return false;
            return true;
        });

        const playerStats = {};

        filtered.forEach(m => {
            const allPlayers = [
                { name: m.teamA.players[0], team: 'A' },
                { name: m.teamA.players[1], team: 'A' },
                { name: m.teamB.players[0], team: 'B' },
                { name: m.teamB.players[1], team: 'B' }
            ];

            // Calculate total points for each team across all sets
            let totalPointsA = 0, totalPointsB = 0;
            if (m.sets && Array.isArray(m.sets)) {
                m.sets.forEach(s => {
                    totalPointsA += (s.scoreA || 0);
                    totalPointsB += (s.scoreB || 0);
                });
            }

            allPlayers.forEach(p => {
                if (!playerStats[p.name]) {
                    playerStats[p.name] = { wins: 0, losses: 0, matches: 0, pointsWon: 0, pointsAgainst: 0, pointsTaken: 0 };
                }
                playerStats[p.name].matches++;
                if (p.team === m.winner) {
                    playerStats[p.name].wins++;
                    // PW/PA only from matches the player won
                    if (p.team === 'A') {
                        playerStats[p.name].pointsWon += totalPointsA;
                        playerStats[p.name].pointsAgainst += totalPointsB;
                    } else {
                        playerStats[p.name].pointsWon += totalPointsB;
                        playerStats[p.name].pointsAgainst += totalPointsA;
                    }
                } else {
                    playerStats[p.name].losses++;
                    // Points Taken: player's team points in lost matches
                    if (p.team === 'A') {
                        playerStats[p.name].pointsTaken += totalPointsA;
                    } else {
                        playerStats[p.name].pointsTaken += totalPointsB;
                    }
                }
            });
        });

        const sorted = Object.entries(playerStats)
            .map(([name, stats]) => ({
                name, ...stats,
                pointsDiff: stats.pointsWon - stats.pointsAgainst,
                winRate: stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0
            }))
            // Sort: wins desc → pointsDiff desc → pointsWon desc → pointsTaken desc
            .sort((a, b) => b.wins - a.wins || b.pointsDiff - a.pointsDiff || b.pointsWon - a.pointsWon || b.pointsTaken - a.pointsTaken);

        const container = document.getElementById('leaderboard-content');
        const dateInfo = (fromDate || toDate) ? `<p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:12px;">Showing: ${fromDate || 'start'} → ${toDate || 'now'} (${filtered.length} matches)</p>` : '';

        if (sorted.length === 0) {
            container.innerHTML = dateInfo + '<p style="text-align:center; color:var(--text-muted); padding:40px;">No match data found for this date range.</p>';
            const perfContainer = document.getElementById('leaderboard-performance');
            if (perfContainer) perfContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">No performance data recorded yet.</p>';
            return;
        }

        let html = dateInfo + `<table>
            <tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>PW</th><th>PA</th><th>+/-</th><th>PT</th><th>Win%</th></tr>`;
        sorted.forEach((p, i) => {
            const rankClass = i < 3 ? `rank-${i+1}` : '';
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
            const diffStr = p.pointsDiff >= 0 ? `+${p.pointsDiff}` : `${p.pointsDiff}`;
            html += `<tr class="${rankClass}">
                <td>${medal}</td><td>${p.name}</td>
                <td>${p.wins}</td><td>${p.losses}</td>
                <td>${p.pointsWon}</td><td>${p.pointsAgainst}</td>
                <td>${diffStr}</td><td>${p.pointsTaken}</td><td>${p.winRate}%</td></tr>`;
        });
        html += '</table>';
        container.innerHTML = html;

        // --- Player Performance Aggregation (same player order as leaderboard) ---
        this.renderLeaderboardPerformance(filtered, sorted);
    }

    renderLeaderboardPerformance(filtered, sorted) {
        const perfContainer = document.getElementById('leaderboard-performance');
        if (!perfContainer) return;

        const positiveTypes = [
            { key: 'smash', label: 'Smash' },
            { key: 'drop', label: 'Drop' },
            { key: 'placed', label: 'Placed' }
        ];
        const negativeTypes = [
            { key: 'net', label: 'Net' },
            { key: 'out', label: 'Out' },
            { key: 'service', label: 'Svc' },
            { key: 'unforced', label: 'UF' },
            { key: 'carry', label: 'Carry' }
        ];

        // Aggregate action counts per player across all filtered matches
        const playerPerf = {};
        sorted.forEach(p => {
            playerPerf[p.name] = {};
        });

        filtered.forEach(m => {
            if (!m.allActions || !Array.isArray(m.allActions)) return;
            const allPlayers = [
                { name: m.teamA.players[0], team: 'A', index: 0 },
                { name: m.teamA.players[1], team: 'A', index: 1 },
                { name: m.teamB.players[0], team: 'B', index: 0 },
                { name: m.teamB.players[1], team: 'B', index: 1 }
            ];
            m.allActions.forEach(action => {
                const player = allPlayers.find(p => p.team === action.team && p.index === action.playerIndex);
                if (!player || !playerPerf[player.name]) return;
                const counts = playerPerf[player.name];
                counts[action.actionType] = (counts[action.actionType] || 0) + 1;
            });
        });

        // Check if any actions exist across all matches
        const hasAnyActions = Object.values(playerPerf).some(counts => Object.keys(counts).length > 0);
        if (!hasAnyActions) {
            perfContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">No performance data recorded yet.</p>';
            return;
        }

        // Build performance table with vertical headers (same as match summary)
        let perfHTML = `<div class="perf-table-wrapper"><table class="perf-table">`;
        perfHTML += `<thead><tr>`;
        perfHTML += `<th class="perf-player-header">Player</th>`;
        positiveTypes.forEach(t => {
            perfHTML += `<th class="perf-col-positive"><span class="perf-vertical">${t.label}</span></th>`;
        });
        perfHTML += `<th class="perf-col-positive perf-col-total"><span class="perf-vertical">+</span></th>`;
        negativeTypes.forEach(t => {
            perfHTML += `<th class="perf-col-negative"><span class="perf-vertical">${t.label}</span></th>`;
        });
        perfHTML += `<th class="perf-col-negative perf-col-total"><span class="perf-vertical">-</span></th>`;
        perfHTML += `</tr></thead>`;

        perfHTML += `<tbody>`;
        sorted.forEach(p => {
            const counts = playerPerf[p.name] || {};
            const totalPositive = positiveTypes.reduce((sum, t) => sum + (counts[t.key] || 0), 0);
            const totalNegative = negativeTypes.reduce((sum, t) => sum + (counts[t.key] || 0), 0);

            perfHTML += `<tr>`;
            perfHTML += `<td class="perf-player-name">${p.name}</td>`;
            positiveTypes.forEach(t => {
                const val = counts[t.key] || 0;
                perfHTML += `<td class="perf-cell perf-cell-positive">${val || '-'}</td>`;
            });
            perfHTML += `<td class="perf-cell perf-cell-positive perf-cell-total"><strong>${totalPositive}</strong></td>`;
            negativeTypes.forEach(t => {
                const val = counts[t.key] || 0;
                perfHTML += `<td class="perf-cell perf-cell-negative">${val || '-'}</td>`;
            });
            perfHTML += `<td class="perf-cell perf-cell-negative perf-cell-total"><strong>${totalNegative}</strong></td>`;
            perfHTML += `</tr>`;
        });

        // Grand total row
        perfHTML += `<tr class="perf-summary-row">`;
        perfHTML += `<td class="perf-player-name"><strong>All</strong></td>`;
        positiveTypes.forEach(t => {
            const total = sorted.reduce((sum, p) => sum + ((playerPerf[p.name] || {})[t.key] || 0), 0);
            perfHTML += `<td class="perf-cell perf-cell-positive"><strong>${total}</strong></td>`;
        });
        const grandPositive = sorted.reduce((sum, p) => {
            const counts = playerPerf[p.name] || {};
            return sum + positiveTypes.reduce((s, t) => s + (counts[t.key] || 0), 0);
        }, 0);
        perfHTML += `<td class="perf-cell perf-cell-positive perf-cell-total"><strong>${grandPositive}</strong></td>`;
        negativeTypes.forEach(t => {
            const total = sorted.reduce((sum, p) => sum + ((playerPerf[p.name] || {})[t.key] || 0), 0);
            perfHTML += `<td class="perf-cell perf-cell-negative"><strong>${total}</strong></td>`;
        });
        const grandNegative = sorted.reduce((sum, p) => {
            const counts = playerPerf[p.name] || {};
            return sum + negativeTypes.reduce((s, t) => s + (counts[t.key] || 0), 0);
        }, 0);
        perfHTML += `<td class="perf-cell perf-cell-negative perf-cell-total"><strong>${grandNegative}</strong></td>`;
        perfHTML += `</tr>`;

        perfHTML += `</tbody></table></div>`;
        perfContainer.innerHTML = perfHTML;
    }

    clearLeaderboardFilters() {
        document.getElementById('leaderboard-from').value = '';
        document.getElementById('leaderboard-to').value = '';
        this.renderLeaderboard();
    }

    printLeaderboard() {
        const content = document.getElementById('leaderboard-content').innerHTML;
        const eventName = this.eventManager?.getActiveEvent()?.name || 'Leaderboard';
        const fromDate = document.getElementById('leaderboard-from').value;
        const toDate = document.getElementById('leaderboard-to').value;
        const dateRange = (fromDate || toDate) ? `${fromDate || 'start'} to ${toDate || 'now'}` : 'All time';

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${eventName} - Leaderboard</title>
<style>
body { font-family: 'Segoe UI', sans-serif; padding: 20px; color: #333; }
h1 { font-size: 1.4rem; margin-bottom: 4px; }
.subtitle { font-size: 0.85rem; color: #666; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { padding: 8px 10px; border-bottom: 1px solid #ddd; text-align: center; }
th { background: #f5f5f5; font-weight: 600; font-size: 0.8rem; }
td:nth-child(2) { text-align: left; }
th:nth-child(2) { text-align: left; }
tr:nth-child(even) { background: #fafafa; }
@media print { body { padding: 0; } }
</style></head><body>
<h1>🏸 ${eventName} - Player Leaderboard</h1>
<p class="subtitle">Period: ${dateRange} | Printed: ${new Date().toLocaleDateString()}</p>
${content}
</body></html>`);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 300);
    }

    // --- Utilities ---
    newMatch() {
        this.match = null;
        this.clearActiveMatch();
        // Reset player selects
        ['teamA-player1', 'teamA-player2', 'teamB-player1', 'teamB-player2'].forEach(id => {
            const select = document.getElementById(id);
            if (select && select.tagName === 'SELECT') {
                select.value = '';
            } else if (select) {
                select.value = '';
            }
            const input = document.getElementById(id + '-new');
            if (input) {
                input.value = '';
                input.classList.add('hidden');
            }
        });
        this.populateMemberPickers();
        document.getElementById('share-preview').classList.add('hidden');
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-section="setup-section"]').classList.add('active');
        this.showSection('setup-section');
    }

    // --- QR Code Share ---
    showQRModal() {
        const url = window.location.href;
        document.getElementById('qr-url-text').textContent = url;
        this.generateQRCode(url);
        document.getElementById('qr-modal').classList.remove('hidden');
    }

    hideQRModal() {
        document.getElementById('qr-modal').classList.add('hidden');
    }

    generateQRCode(text) {
        const canvas = document.getElementById('qr-canvas');
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Use the qrcode-lib (loaded via script tag)
        if (typeof qrcode === 'function') {
            try {
                // Use type 4 for short URLs, type 10 for longer ones
                const typeNum = text.length > 50 ? 10 : 4;
                const qr = qrcode(typeNum, 'L');
                qr.addData(text);
                qr.make();
                const moduleCount = qr.getModuleCount();
                const cellSize = size / moduleCount;

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, size, size);

                ctx.fillStyle = '#000000';
                for (let row = 0; row < moduleCount; row++) {
                    for (let col = 0; col < moduleCount; col++) {
                        if (qr.isDark(row, col)) {
                            ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                        }
                    }
                }
                return;
            } catch (e) {
                console.error('[QR] Generation failed:', e);
            }
        }

        // Fallback if library not loaded
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#333333';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('QR generation failed', size/2, size/2 - 10);
        ctx.font = '10px sans-serif';
        ctx.fillText(text.substring(0, 40), size/2, size/2 + 10);
    }

    showSection(sectionId) {
        document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
        document.getElementById(sectionId).classList.remove('hidden');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new BadmintonScoreSheet();
});
