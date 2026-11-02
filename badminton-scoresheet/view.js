/**
 * Public, read-only leaderboard viewer.
 * URL: view.html?t=<shareToken>   (no login, no app install required)
 * Reads publicEvents/{token} live via onSnapshot.
 */
(function () {
    const THEME_KEY = 'badminton-theme';
    const POS = [{ key: 'smash', label: 'Smash' }, { key: 'drop', label: 'Drop' }, { key: 'placed', label: 'Placed' }];
    const NEG = [{ key: 'net', label: 'Net' }, { key: 'out', label: 'Out' }, { key: 'service', label: 'Svc' },
        { key: 'unforced', label: 'UF' }, { key: 'carry', label: 'Carry' }];

    const $ = id => document.getElementById(id);

    // Names come from user input in a public database: always escape.
    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function initTheme() {
        let theme = 'dark';
        try { theme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
        applyTheme(theme);
        $('btn-theme-toggle').addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        $('btn-theme-toggle').textContent = theme === 'dark' ? '🌙' : '☀️';
    }

    function showStatus(msg) {
        $('viewer-status').textContent = msg;
        $('viewer-status').classList.remove('hidden');
        $('viewer-content').classList.add('hidden');
    }

    function setLive(on, label) {
        const el = $('viewer-live');
        el.textContent = label;
        el.classList.toggle('on', on);
    }

    function renderLeaderboard(rows) {
        if (!rows.length) {
            $('leaderboard-content').innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;">No matches played yet.</p>';
            return;
        }
        let html = '<table><tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>PW</th><th>PA</th><th>+/-</th><th>PT</th><th>Win%</th></tr>';
        rows.forEach((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            const diff = p.pointsDiff >= 0 ? `+${p.pointsDiff}` : `${p.pointsDiff}`;
            html += `<tr class="${i < 3 ? 'rank-' + (i + 1) : ''}"><td>${medal}</td><td>${esc(p.name)}</td>` +
                `<td>${esc(p.wins)}</td><td>${esc(p.losses)}</td><td>${esc(p.pointsWon)}</td><td>${esc(p.pointsAgainst)}</td>` +
                `<td>${esc(diff)}</td><td>${esc(p.pointsTaken)}</td><td>${esc(p.winRate)}%</td></tr>`;
        });
        $('leaderboard-content').innerHTML = html + '</table>';
    }

    function renderPerformance(perf) {
        const hasAny = perf.some(p => Object.keys(p.counts || {}).length > 0);
        if (!hasAny) {
            $('leaderboard-performance').innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">No performance data recorded yet.</p>';
            return;
        }
        const sum = (counts, list) => list.reduce((s, t) => s + (counts[t.key] || 0), 0);
        const cell = (v, cls) => `<td class="perf-cell ${cls}">${v || '-'}</td>`;
        const tot = (v, cls) => `<td class="perf-cell ${cls} perf-cell-total"><strong>${v}</strong></td>`;

        let html = '<div class="perf-table-wrapper"><table class="perf-table"><thead><tr><th class="perf-player-header">Player</th>';
        POS.forEach(t => { html += `<th class="perf-col-positive"><span class="perf-vertical">${t.label}</span></th>`; });
        html += '<th class="perf-col-positive perf-col-total"><span class="perf-vertical">+</span></th>';
        NEG.forEach(t => { html += `<th class="perf-col-negative"><span class="perf-vertical">${t.label}</span></th>`; });
        html += '<th class="perf-col-negative perf-col-total"><span class="perf-vertical">-</span></th></tr></thead><tbody>';

        const all = {};
        perf.forEach(p => {
            const c = p.counts || {};
            html += `<tr><td class="perf-player-name">${esc(p.name)}</td>`;
            POS.forEach(t => { html += cell(c[t.key], 'perf-cell-positive'); all[t.key] = (all[t.key] || 0) + (c[t.key] || 0); });
            html += tot(sum(c, POS), 'perf-cell-positive');
            NEG.forEach(t => { html += cell(c[t.key], 'perf-cell-negative'); all[t.key] = (all[t.key] || 0) + (c[t.key] || 0); });
            html += tot(sum(c, NEG), 'perf-cell-negative') + '</tr>';
        });

        html += '<tr class="perf-summary-row"><td class="perf-player-name"><strong>All</strong></td>';
        POS.forEach(t => { html += tot(all[t.key] || 0, 'perf-cell-positive').replace(' perf-cell-total', ''); });
        html += tot(sum(all, POS), 'perf-cell-positive');
        NEG.forEach(t => { html += tot(all[t.key] || 0, 'perf-cell-negative').replace(' perf-cell-total', ''); });
        html += tot(sum(all, NEG), 'perf-cell-negative') + '</tr></tbody></table></div>';
        $('leaderboard-performance').innerHTML = html;
    }

    function renderRecent(matches) {
        if (!matches.length) {
            $('recent-matches').innerHTML = '<p style="color:var(--text-muted);">No matches yet.</p>';
            return;
        }
        $('recent-matches').innerHTML = matches.map(m => {
            const date = m.date ? new Date(m.date).toLocaleString() : '';
            const score = (m.sets || []).map(s => `${esc(s[0])}-${esc(s[1])}`).join(', ');
            const a = (m.teamA || []).map(esc).join(' &amp; ');
            const b = (m.teamB || []).map(esc).join(' &amp; ');
            const aw = m.winner === 'A' ? ' class="rm-win"' : '';
            const bw = m.winner === 'B' ? ' class="rm-win"' : '';
            return `<div class="recent-match"><div class="rm-date">${esc(date)}</div>` +
                `<span${aw}>${a}</span> vs <span${bw}>${b}</span><span class="rm-score">${score}</span></div>`;
        }).join('');
    }

    function render(data) {
        $('event-title').textContent = data.eventName || 'Leaderboard';
        document.title = `${data.eventName || 'Leaderboard'} - SPARK`;
        $('viewer-updated').textContent = data.updatedAt
            ? `· Updated ${new Date(data.updatedAt).toLocaleString()} · ${data.matchCount || 0} matches` : '';
        renderLeaderboard(data.leaderboard || []);
        renderPerformance(data.performance || []);
        renderRecent(data.recentMatches || []);
        $('viewer-status').classList.add('hidden');
        $('viewer-content').classList.remove('hidden');
    }

    function start() {
        initTheme();
        const token = new URLSearchParams(location.search).get('t');
        if (!token || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
            setLive(false, 'Invalid link');
            showStatus('This leaderboard link is not valid.');
            return;
        }
        if (typeof firebase === 'undefined') {
            setLive(false, 'Offline');
            showStatus('Could not load. Please check your internet connection and refresh.');
            return;
        }

        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        db.collection('publicEvents').doc(token).onSnapshot(
            snap => {
                if (!snap.exists) {
                    setLive(false, 'Not available');
                    showStatus('This leaderboard is not available. Sharing may have been turned off.');
                    return;
                }
                setLive(true, 'Live');
                render(snap.data());
            },
            err => {
                console.warn('[Viewer] snapshot error', err);
                setLive(false, 'Disconnected');
                showStatus('Could not load the leaderboard. Please refresh and try again.');
            }
        );
    }

    document.addEventListener('DOMContentLoaded', start);
})();
