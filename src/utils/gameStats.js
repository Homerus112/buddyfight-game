// 게임 기록/통계 시스템
const STATS_KEY = 'bf_game_stats';
const HISTORY_KEY = 'bf_game_history';

function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch { return {}; }
}
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

export function recordGame({ result, deckName, flagName, turns, opponentDeck }) {
  const stats = loadStats();
  const history = loadHistory();

  // 통계 업데이트
  stats.totalGames = (stats.totalGames || 0) + 1;
  if (result === 'win') stats.wins = (stats.wins || 0) + 1;
  else stats.losses = (stats.losses || 0) + 1;

  // 덱별 통계
  if (!stats.deckStats) stats.deckStats = {};
  if (deckName) {
    if (!stats.deckStats[deckName]) stats.deckStats[deckName] = { wins: 0, losses: 0, games: 0 };
    stats.deckStats[deckName].games++;
    if (result === 'win') stats.deckStats[deckName].wins++;
    else stats.deckStats[deckName].losses++;
  }
  stats.lastUpdated = Date.now();

  // 히스토리 (최대 50개)
  history.unshift({
    date: new Date().toLocaleDateString('ko-KR'),
    time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    result, deckName, flagName, turns, opponentDeck,
    timestamp: Date.now(),
  });
  if (history.length > 50) history.splice(50);

  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
  return stats;
}

export function getStats() { return loadStats(); }
export function getHistory() { return loadHistory(); }

export function getMostUsedDeck() {
  const stats = loadStats();
  if (!stats.deckStats) return null;
  const decks = Object.entries(stats.deckStats);
  if (!decks.length) return null;
  return decks.sort((a, b) => b[1].games - a[1].games)[0];
}

export function getWinRate() {
  const s = loadStats();
  if (!s.totalGames) return 0;
  return Math.round((s.wins || 0) / s.totalGames * 100);
}

export function resetStats() {
  localStorage.removeItem(STATS_KEY);
  localStorage.removeItem(HISTORY_KEY);
}
