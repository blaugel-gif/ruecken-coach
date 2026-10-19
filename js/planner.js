import { EXERCISES, exerciseDuration } from './exercises.js?v=202610191025';

export const MODES = {
  10: { minutes: 10, label: 'Basis', when: 'morgens', budget: 600, prep: 10 },
  5: { minutes: 5, label: 'Mittag', when: 'mittags', budget: 300, prep: 9 },
  3: { minutes: 3, label: 'Kurz', when: 'zwischendurch', budget: 180, prep: 8 },
};

const VARIANTS = {
  10: [
    { name: 'Hüfte lösen', slots: ['warmup', 'hip', 'mobility', 'hip', 'posture', 'hip', 'relax'] },
    { name: 'Aufrichtung & Kraft', slots: ['warmup', 'mobility', 'posture', 'stability', 'hip', 'stability', 'relax'] },
    { name: 'Ausgewogen', slots: ['warmup', 'hip', 'mobility', 'posture', 'stability', 'hip', 'relax'] },
  ],
  5: [
    { name: 'Hüfte lösen', slots: ['hip', 'hip', 'posture', 'mobility'] },
    { name: 'Aufrichtung & Kraft', slots: ['posture', 'stability', 'hip', 'mobility'] },
    { name: 'Ausgewogen', slots: ['mobility', 'hip', 'posture', 'stability'] },
  ],
  3: [
    { name: 'Hüfte lösen', slots: ['hip', 'posture'] },
    { name: 'Aufrichtung', slots: ['posture', 'stability'] },
    { name: 'Lockern', slots: ['mobility', 'hip'] },
  ],
};

const FLOOR = new Set(['supine', 'prone', 'quad', 'kneel', 'floorsit']);
const POS_ORDER = ['stand', 'sit', 'kneel', 'quad', 'floorsit', 'prone', 'supine'];

export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function weightedPick(rng, items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function slotMatches(ex, slot) {
  if (slot === 'posture') return ex.cat === 'posture' || (ex.cat === 'stability' && ex.view === 'front' && ex.checks.length >= 2);
  if (slot === 'stability') return ex.cat === 'stability' || ex.cat === 'posture';
  return ex.cat === slot;
}

/**
 * Erzeugt einen Tagesplan.
 * opts: { mode, equipment:[], date:'YYYY-MM-DD', variant:0..2, recent:{id: daysAgo}, intensity:1, reroll:0 }
 */
export function buildPlan(opts) {
  const mode = MODES[opts.mode];
  const variant = VARIANTS[opts.mode][opts.variant % 3];
  const rng = hashSeed(`${opts.date}|${opts.mode}|${opts.variant}|${opts.reroll || 0}`);
  const have = new Set(opts.equipment || []);
  const recent = opts.recent || {};
  const avoidFloor = opts.mode === 3 || (opts.mode === 5 && opts.floorAtNoon === false);

  const pool = EXERCISES.filter((e) => e.equip.every((q) => have.has(q)));
  const picked = [];
  for (const slot of variant.slots) {
    let cands = pool.filter((e) => slotMatches(e, slot) && !picked.includes(e));
    if (avoidFloor) cands = cands.filter((e) => !FLOOR.has(e.pos));
    if (!cands.length) cands = pool.filter((e) => !picked.includes(e) && !(avoidFloor && FLOOR.has(e.pos)) && e.cat !== 'warmup' && e.cat !== 'relax');
    if (!cands.length) continue;
    const weights = cands.map((e) => {
      let w = 1;
      const d = recent[e.id];
      if (d !== undefined) w *= d <= 0 ? 0.2 : d <= 1 ? 0.35 : d <= 2 ? 0.6 : 1;
      if (e.checks.length) w *= 1.3; // Live-Prüfung bevorzugen
      if (opts.mode !== 10 && FLOOR.has(e.pos)) w *= 0.5;
      return w;
    });
    picked.push(weightedPick(rng, cands, weights));
  }

  // Reihenfolge: Aufwärmen zuerst, Entspannung zuletzt, Mitte nach Position gruppiert
  const first = picked.filter((e) => e.cat === 'warmup');
  const last = picked.filter((e) => e.cat === 'relax');
  const mid = picked.filter((e) => e.cat !== 'warmup' && e.cat !== 'relax')
    .sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos));
  let ordered = [...first, ...mid, ...last];

  const intensity = opts.intensity || 1;
  let items = ordered.map((e) => dose(e, intensity));

  // Auf Zeitbudget bringen
  const total = () => items.reduce((s, it) => s + itemDuration(it, mode.prep), 0);
  while (total() > mode.budget * 1.15 && items.length > 2) {
    // Übung mit geringster Priorität entfernen (Mitte, von hinten)
    const idx = items.map((it, i) => i).reverse().find((i) => items[i].cat !== 'warmup' && items[i].cat !== 'relax' && i > 0) ?? items.length - 1;
    items.splice(idx, 1);
  }
  for (let guard = 0; guard < 40; guard++) {
    const t = total();
    if (Math.abs(t - mode.budget) <= mode.budget * 0.06) break;
    const grow = t < mode.budget;
    let changed = false;
    for (const it of items) {
      if (Math.abs(total() - mode.budget) <= mode.budget * 0.06) break;
      if (it.type === 'hold' && it.hold <= 12) {
        const nr = it.reps + (grow ? 1 : -1);
        if (nr >= 1 && nr <= 8) { it.reps = nr; changed = true; }
      } else {
        const nh = it.hold + (grow ? 5 : -5);
        if (nh >= 15 && nh <= 60) { it.hold = nh; changed = true; }
      }
    }
    if (!changed) break;
  }

  return {
    mode: opts.mode,
    variant: opts.variant,
    variantName: variant.name,
    date: opts.date,
    reroll: opts.reroll || 0,
    items,
    seconds: total(),
  };
}

function dose(ex, intensity) {
  const it = {
    id: ex.id, name: ex.name, cat: ex.cat, type: ex.type, view: ex.view, pos: ex.pos,
    reps: ex.reps, hold: ex.hold, rest: ex.rest, sides: ex.sides,
  };
  if (ex.type === 'hold') it.hold = Math.max(4, Math.round(ex.hold * intensity));
  else it.hold = Math.max(15, Math.round((ex.hold * intensity) / 5) * 5);
  return it;
}

export function itemDuration(it, prep) {
  return exerciseDuration(it, prep);
}

export function defaultModeForHour(h) {
  if (h < 11) return 10;
  if (h < 15) return 5;
  return 3;
}

export function suggestions(opts) {
  return [0, 1, 2].map((v) => buildPlan({ ...opts, variant: v }));
}
