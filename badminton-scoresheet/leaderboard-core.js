/**
 * LeaderboardCore - pure leaderboard / performance / public-summary builders.
 *
 * No DOM or storage access, so it runs in the app, the public viewer page
 * (view.html) and unit tests. Loaded as a browser global (`LeaderboardCore`)
 * or via require() under Node.
 *
 * The ranking logic mirrors BadmintonScoreSheet.renderLeaderboard():
 *   Sort: wins desc -> pointsDiff desc -> pointsWon desc -> pointsTaken desc
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LeaderboardCore = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    const POSITIVE_TYPES = ['smash', 'drop', 'placed'];
    const NEGATIVE_TYPES = ['net', 'out', 'service', 'unforced', 'carry'];
    const RECENT_MATCH_LIMIT = 20;

    function matchPlayers(m) {
        return [
            { name: m.teamA.players[0], team: 'A', index: 0 },
            { name: m.teamA.players[1], team: 'A', index: 1 },
            { name: m.teamB.players[0], team: 'B', index: 0 },
            { name: m.teamB.players[1], team: 'B', index: 1 }
        ];
    }

    function isValidMatch(m) {
        return !!(m && m.teamA && m.teamB &&
            Array.isArray(m.teamA.players) && Array.isArray(m.teamB.players));
    }

    function totalPoints(m) {
        let a = 0, b = 0;
        if (Array.isArray(m.sets)) {
            m.sets.forEach(s => { a += (s.scoreA || 0); b += (s.scoreB || 0); });
        }
        return { a, b };
    }

    /** Ranked player rows from a match history array. */
    function buildLeaderboard(history) {
        const stats = {};
        (history || []).filter(isValidMatch).forEach(m => {
            const { a, b } = totalPoints(m);
            matchPlayers(m).forEach(p => {
                if (!p.name) return;
                const s = stats[p.name] || (stats[p.name] =
                    { wins: 0, losses: 0, matches: 0, pointsWon: 0, pointsAgainst: 0, pointsTaken: 0 });
                s.matches++;
                const own = p.team === 'A' ? a : b;
                const other = p.team === 'A' ? b : a;
                if (p.team === m.winner) {
                    s.wins++;
                    s.pointsWon += own;
                    s.pointsAgainst += other;
                } else {
                    s.losses++;
                    s.pointsTaken += own;
                }
            });
        });

        return Object.entries(stats)
            .map(([name, s]) => ({
                name, ...s,
                pointsDiff: s.pointsWon - s.pointsAgainst,
                winRate: s.matches > 0 ? Math.round((s.wins / s.matches) * 100) : 0
            }))
            .sort((x, y) => y.wins - x.wins || y.pointsDiff - x.pointsDiff ||
                y.pointsWon - x.pointsWon || y.pointsTaken - x.pointsTaken);
    }

    /** Per-player action counts, in the same order as `rows`. */
    function buildPerformance(history, rows) {
        const perf = {};
        rows.forEach(r => { perf[r.name] = {}; });

        (history || []).filter(isValidMatch).forEach(m => {
            if (!Array.isArray(m.allActions)) return;
            const players = matchPlayers(m);
            m.allActions.forEach(action => {
                const p = players.find(x => x.team === action.team && x.index === action.playerIndex);
                if (!p || !perf[p.name]) return;
                perf[p.name][action.actionType] = (perf[p.name][action.actionType] || 0) + 1;
            });
        });

        return rows.map(r => {
            const counts = perf[r.name] || {};
            const compact = {};
            [...POSITIVE_TYPES, ...NEGATIVE_TYPES].forEach(t => { if (counts[t]) compact[t] = counts[t]; });
            return { name: r.name, counts: compact };
        });
    }

    function buildRecentMatches(history) {
        return (history || []).filter(isValidMatch)
            .slice()
            .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')))
            .slice(0, RECENT_MATCH_LIMIT)
            .map(m => ({
                id: String(m.id),
                date: m.date || '',
                teamA: m.teamA.players.slice(0, 2),
                teamB: m.teamB.players.slice(0, 2),
                // Objects, not [a, b] pairs: Firestore rejects nested arrays
                sets: (m.sets || []).map(s => ({ a: s.scoreA || 0, b: s.scoreB || 0 })),
                winner: m.winner || ''
            }));
    }

    /**
     * Sanitised, self-contained snapshot for the public viewer. Deliberately
     * excludes raw actions/errors, member records and active-match state.
     */
    function buildPublicSummary(event, history, now) {
        const valid = (history || []).filter(isValidMatch);
        const rows = buildLeaderboard(valid);
        return {
            version: 1,
            eventName: (event && event.name) || '',
            updatedAt: now == null ? Date.now() : now,
            matchCount: valid.length,
            leaderboard: rows,
            performance: buildPerformance(valid, rows),
            recentMatches: buildRecentMatches(valid)
        };
    }

    return {
        POSITIVE_TYPES, NEGATIVE_TYPES,
        buildLeaderboard, buildPerformance, buildRecentMatches, buildPublicSummary
    };
});
