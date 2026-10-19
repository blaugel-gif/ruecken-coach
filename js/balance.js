// Muskelgruppen-Bilanz: Wie viel Trainingszeit ging zuletzt an welche Muskelgruppe?
// Grundlage sind die letzten WINDOW_MIN Minuten tatsächlicher Übungszeit (über mehrere Einheiten).
import { EXERCISES, MUSCLES, byId } from './exercises.js?v=202610192125';

export const WINDOW_MIN = 45;
const DAY = 864e5;

// Gewicht je Muskelgruppe: Hauptgruppe 1, weitere 0,5
function weights(ex) {
  const m = ex?.muscles || [];
  return m.map((g, i) => [g, i === 0 ? 1 : 0.5]);
}

/**
 * hist: gespeicherte Einheiten (neueste zuerst oder beliebig)
 * Rückgabe: { windowSec, groups: {id: {sec, share, need, lastAt, label}}, exLast: {exId: ts} }
 */
export function computeBalance(hist, windowMin = WINDOW_MIN, now = Date.now()) {
  const sessions = [...(hist || [])].filter((s) => s.started_at).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  const groups = Object.fromEntries(Object.entries(MUSCLES).map(([id, label]) => [id, { id, label, sec: 0, lastAt: null }]));
  const exLast = {};
  let used = 0;
  const limit = windowMin * 60;
  for (const s of sessions) {
    const ts = +new Date(s.started_at);
    for (const e of s.exercises || []) {
      const sec = e.workSec ?? 0;
      if (sec < 5) continue;
      exLast[e.id] = Math.max(exLast[e.id] || 0, ts);
      const ex = byId[e.id];
      for (const [g] of weights(ex)) if (groups[g]) groups[g].lastAt = Math.max(groups[g].lastAt || 0, ts);
      if (used >= limit) continue;
      const take = Math.min(sec, limit - used);
      used += take;
      const w = weights(ex), wsum = w.reduce((a, [, x]) => a + x, 0) || 1;
      for (const [g, x] of w) if (groups[g]) groups[g].sec += (take * x) / wsum;
    }
  }
  const ids = Object.keys(groups);
  const fair = 1 / ids.length;
  for (const g of Object.values(groups)) {
    g.share = used ? g.sec / used : 0;
    const deficit = used ? Math.max(0, Math.min(1, 1 - g.share / fair)) : 1; // 1 = gar nicht trainiert
    const days = g.lastAt ? (now - g.lastAt) / DAY : null;
    const stale = days === null ? 1 : Math.min(1, days / 4);
    g.need = Math.round((0.65 * deficit + 0.35 * stale) * 1000) / 1000;
    g.days = days;
  }
  return { windowSec: used, groups, exLast };
}

// Bedarf einer Übung: gewichteter Bedarf ihrer Muskelgruppen + wie lange sie selbst nicht dran war
export function exerciseNeed(ex, bal, now = Date.now()) {
  const w = weights(ex);
  const wsum = w.reduce((a, [, x]) => a + x, 0) || 1;
  const groupNeed = w.reduce((a, [g, x]) => a + (bal.groups[g]?.need ?? 1) * x, 0) / wsum;
  const last = bal.exLast[ex.id];
  const days = last ? (now - last) / DAY : null;
  const exStale = days === null ? 1 : Math.min(1, days / 7);
  return { score: Math.round((0.6 * groupNeed + 0.4 * exStale) * 1000) / 1000, groupNeed, days };
}

export function rankExercises(bal, equipment, now = Date.now()) {
  const have = new Set(equipment || []);
  return EXERCISES.filter((e) => e.equip.every((q) => have.has(q)))
    .map((e) => ({ ex: e, ...exerciseNeed(e, bal, now) }))
    .sort((a, b) => b.score - a.score);
}

export function focusGroups(bal, n = 3) {
  return Object.values(bal.groups).sort((a, b) => b.need - a.need).slice(0, n);
}

export function agoText(days) {
  if (days === null || days === undefined) return 'noch nie';
  if (days < 1 / 24) return 'gerade eben';
  if (days < 1) return `vor ${Math.max(1, Math.round(days * 24))} Std.`;
  if (days < 2) return 'gestern';
  return `vor ${Math.round(days)} Tagen`;
}
