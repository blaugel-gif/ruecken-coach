// Haltungserkennung: MediaPipe Pose Landmarker + Metriken + Prüfungen + Overlay

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODELS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

export const L = { nose: 0, lEar: 7, rEar: 8, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28 };

const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [7, 11], [8, 12],
];
// Feinere Drahtgitterlinien: Gesicht, Hände, Füße
const FINE = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [15, 17], [15, 19], [15, 21], [17, 19], [16, 18], [16, 20], [16, 22], [18, 20],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
];

let landmarker = null;
export async function loadPoseModel(quality = 'lite', log = () => {}) {
  if (landmarker) return landmarker;
  const t0 = performance.now();
  const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MODELS[quality] || MODELS.lite, delegate },
    runningMode: 'VIDEO', numPoses: 3,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try {
    landmarker = await vision.PoseLandmarker.createFromOptions(fileset, opts('GPU'));
    log('model_loaded', { delegate: 'GPU', quality, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    log('model_gpu_failed', { error: String(e) });
    landmarker = await vision.PoseLandmarker.createFromOptions(fileset, opts('CPU'));
    log('model_loaded', { delegate: 'CPU', quality, ms: Math.round(performance.now() - t0) });
  }
  return landmarker;
}

// ── Geometrie ─────────────────────────────────────────────
const deg = (r) => (r * 180) / Math.PI;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });
function angle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

// Bei mehreren Personen (z. B. Kinder im Bild): die größte, möglichst vollständig sichtbare wählen,
// bevorzugt nahe an der zuletzt verfolgten Person.
export function pickPose(list, prevCenter) {
  if (!list?.length) return { lm: null, idx: -1, n: 0 };
  let best = -1, bestScore = -Infinity;
  list.forEach((lm, i) => {
    const xs = lm.filter((p) => (p.visibility ?? 1) > 0.4).map((p) => p.x), ys = lm.filter((p) => (p.visibility ?? 1) > 0.4).map((p) => p.y);
    if (!xs.length) return;
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    const vis = lm.reduce((a, p) => a + (p.visibility ?? 1), 0) / lm.length;
    const cx = (lm[23].x + lm[24].x) / 2, cy = (lm[23].y + lm[24].y) / 2;
    const near = prevCenter ? Math.hypot(cx - prevCenter[0], cy - prevCenter[1]) : 0;
    const sc = area * 2 + vis - near * 1.5;
    if (sc > bestScore) { bestScore = sc; best = i; }
  });
  const lm = best >= 0 ? list[best] : null;
  return { lm, idx: best, n: list.length, center: lm ? [(lm[23].x + lm[24].x) / 2, (lm[23].y + lm[24].y) / 2] : prevCenter };
}

export function toPoints(lm, W, H, swap = false) {
  const P = lm.map((p) => ({ x: p.x * W, y: p.y * H, v: p.visibility ?? 1 }));
  if (swap) {
    const pairs = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10]];
    for (let i = 11; i < 33; i += 2) pairs.push([i, i + 1]);
    for (const [a, b] of pairs) { const t = P[a]; P[a] = P[b]; P[b] = t; }
  }
  return P;
}

// Alle Metriken (Bildkoordinaten in Pixeln, y nach unten)
export function computeMetrics(P) {
  const m = {};
  const LS = P[L.lSh], RS = P[L.rSh], LH = P[L.lHip], RH = P[L.rHip];
  const vis = (...idx) => Math.min(...idx.map((i) => P[i].v));
  m._vis = {};

  // Frontal
  const sw = Math.max(1, Math.abs(LS.x - RS.x));
  const leftDir = Math.sign(LS.x - RS.x) || 1; // Richtung "linke Körperseite" im Bild
  const midS = mid(LS, RS), midH = mid(LH, RH);
  m.shoulderTilt = deg(Math.atan2(RS.y - LS.y, sw));
  m.hipTilt = deg(Math.atan2(RH.y - LH.y, Math.max(1, Math.abs(LH.x - RH.x))));
  m.trunkShift = ((midS.x - midH.x) * leftDir) / sw;
  m.headShift = ((P[L.nose].x - midS.x) * leftDir) / sw;
  m.elbowDiff = (P[L.lEl].y - P[L.rEl].y) / sw;
  m.wristDiff = (P[L.lWr].y - P[L.rWr].y) / sw;
  m._frontal = sw / Math.max(1, dist(midS, midH)); // >0.45 ≈ frontal
  m._vis.shoulders = vis(L.lSh, L.rSh);
  m._vis.hips = vis(L.lHip, L.rHip);
  m._vis.head = vis(L.nose);
  m._vis.elbows = vis(L.lEl, L.rEl);
  m._vis.wrists = vis(L.lWr, L.rWr);

  // Seitlich: sichtbarere Körperseite wählen
  const sideVis = (s) => ['Sh', 'Hip', 'Kn', 'An'].reduce((a, k) => a + P[L[s + k]].v, 0);
  const s = sideVis('l') >= sideVis('r') ? 'l' : 'r';
  const S = P[L[s + 'Sh']], Hh = P[L[s + 'Hip']], K = P[L[s + 'Kn']], A = P[L[s + 'An']], E = P[s === 'l' ? L.lEar : L.rEar];
  const dir = Math.sign(P[L.nose].x - E.x) || 1; // Blickrichtung im Bild
  const torso = Math.max(1, dist(S, Hh));
  m.side = s;
  m.trunkLean = deg(Math.atan2((S.x - Hh.x) * dir, Hh.y - S.y));
  m.hipAngle = angle(S, Hh, K);
  m.kneeAngle = angle(Hh, K, A);
  m.earForward = ((E.x - S.x) * dir) / torso;
  m.torsoFromHorizontal = deg(Math.atan2(Math.abs(S.y - Hh.y), Math.abs(S.x - Hh.x)));
  m.handsUnderShoulders = Math.abs(S.x - P[L[s + 'Wr']].x) / torso;
  m.kneesUnderHips = Math.abs(Hh.x - K.x) / torso;
  // Ausgestreckter Arm / Bein (Vierfüßler diagonal)
  const arms = [['lSh', 'lWr'], ['rSh', 'rWr']].map(([a, b]) => ({ dx: Math.abs(P[L[b]].x - P[L[a]].x) / torso, ang: deg(Math.atan2(P[L[a]].y - P[L[b]].y, Math.abs(P[L[b]].x - P[L[a]].x))), v: Math.min(P[L[a]].v, P[L[b]].v), i: [L[a], L[b]] }));
  const legs = [['lHip', 'lAn'], ['rHip', 'rAn']].map(([a, b]) => ({ dx: Math.abs(P[L[b]].x - P[L[a]].x) / torso, ang: deg(Math.atan2(P[L[a]].y - P[L[b]].y, Math.abs(P[L[b]].x - P[L[a]].x))), v: Math.min(P[L[a]].v, P[L[b]].v), i: [L[a], L[b]] }));
  const arm = arms.sort((a, b) => b.dx - a.dx)[0];
  const leg = legs.sort((a, b) => b.dx - a.dx)[0];
  m.armLevel = arm.dx > 0.6 ? arm.ang : null;
  m.legLevel = leg.dx > 0.9 ? leg.ang : null;
  m._armIdx = arm.i; m._legIdx = leg.i;
  m._vis.side = Math.min(S.v, Hh.v);
  m._vis.sideLeg = Math.min(K.v, A.v);
  m._vis.ear = E.v;
  m._sideIdx = { S: L[s + 'Sh'], H: L[s + 'Hip'], K: L[s + 'Kn'], A: L[s + 'An'], E: s === 'l' ? L.lEar : L.rEar, W: L[s + 'Wr'] };

  // ── Zusatzmetriken für die Bewegungsphasen ──
  const ok = (...idx) => idx.every((i) => P[i].v > 0.45);
  const N = P[L.nose];
  const torsoF = Math.max(1, dist(midS, midH));
  const hipW = Math.max(1, Math.abs(LH.x - RH.x));
  const pairs = [['l', L.lSh, L.lEl, L.lWr, L.lHip, L.lKn, L.lAn, L.lEar], ['r', L.rSh, L.rEl, L.rWr, L.rHip, L.rKn, L.rAn, L.rEar]];
  let above = 0, atSh = 0, elAtSh = 0, wrAboveEl = 0, behind = 0, ribs = 0, armsSeen = 0;
  for (const [, sh, el, wr, hp, , , ear] of pairs) {
    if (!ok(sh, el, wr)) continue;
    armsSeen++;
    if (P[wr].y < N.y - 0.12 * torsoF) above++;
    if (Math.abs(P[wr].y - P[sh].y) < 0.3 * torsoF) atSh++;
    if (Math.abs(P[el].y - P[sh].y) < 0.28 * torsoF) elAtSh++;
    if (P[wr].y < P[el].y - 0.15 * torsoF) wrAboveEl++;
    if (P[wr].y < P[sh].y && dist(P[wr], P[ear]) < 0.75 * sw) behind++;
    if (ok(hp) && P[wr].y > P[sh].y + 0.25 * torsoF && P[wr].y < P[hp].y + 0.1 * torsoF && Math.abs(P[wr].x - P[sh].x) < 0.55 * sw) ribs++;
  }
  m.wristsAboveHead = armsSeen ? above : null;
  m.wristsAtShoulder = armsSeen ? atSh : null;
  m.armsU = armsSeen === 2 ? (elAtSh === 2 && wrAboveEl === 2 ? 1 : 0) : null;
  m.handsBehindHead = armsSeen ? behind : null;
  m.wristsAtRibs = armsSeen ? ribs : null;
  m.wristSpread = ok(L.lWr, L.rWr) ? Math.abs(P[L.lWr].x - P[L.rWr].x) / sw : null;
  m.kneeLiftL = ok(L.lHip, L.lKn) ? (P[L.lKn].y - P[L.lHip].y) / torsoF : null;
  m.kneeLiftR = ok(L.rHip, L.rKn) ? (P[L.rKn].y - P[L.rHip].y) / torsoF : null;
  m.kneeLift = m.kneeLiftL !== null && m.kneeLiftR !== null ? Math.min(m.kneeLiftL, m.kneeLiftR) : (m.kneeLiftL ?? m.kneeLiftR);
  if (ok(L.lKn, L.rKn, L.lHip, L.rHip)) {
    const lifted = P[L.lKn].y < P[L.rKn].y ? P[L.lKn] : P[L.rKn];
    m.kneeOut = Math.abs(lifted.x - midH.x) / hipW;
    m.kneeSpread = Math.abs(P[L.lKn].x - P[L.rKn].x) / hipW;
  } else { m.kneeOut = null; m.kneeSpread = null; }
  m.pelvisShift = ok(L.lHip, L.rHip, L.lAn, L.rAn) ? (((midH.x - (P[L.lAn].x + P[L.rAn].x) / 2) * leftDir) / hipW) : null;
  m.footLift = ok(L.lAn, L.rAn) ? Math.abs(P[L.lAn].y - P[L.rAn].y) / torsoF : null;
  m.neckLen = ok(L.lEar, L.rEar, L.lSh, L.rSh) ? (midS.y - (P[L.lEar].y + P[L.rEar].y) / 2) / sw : null;
  m.noseY = ok(L.nose) ? N.y / torsoF : null;
  m.shoulderHipDiff = m.shoulderTilt - m.hipTilt; // unabhängig von einer schräg stehenden Kamera
  // Seitlich
  m.headDrop = ok(L.nose) && S.v > 0.45 ? (N.y - S.y) / torso : null;
  m.noseAboveShoulder = m.headDrop === null ? null : -m.headDrop;
  const W = P[L[s + 'Wr']], W2 = P[L[(s === 'l' ? 'r' : 'l') + 'Wr']];
  const wa = [W, W2].filter((w) => w.v > 0.4).map((w) => (S.y - w.y) / torso);
  m.wristAboveShoulder = wa.length ? Math.max(...wa) : null;
  m.lying = m.torsoFromHorizontal < 30 ? 1 : 0;
  const hipAng = (sh, hp, kn) => (ok(sh, hp, kn) ? angle(P[sh], P[hp], P[kn]) : null);
  const ha = [hipAng(L.lSh, L.lHip, L.lKn), hipAng(L.rSh, L.rHip, L.rKn)].filter((v) => v !== null);
  m.hipAngleMin = ha.length ? Math.min(...ha) : null;
  m.hipAngleMax = ha.length ? Math.max(...ha) : null;
  const kneeAng = (hp, kn, an) => (ok(hp, kn, an) ? angle(P[hp], P[kn], P[an]) : null);
  const ka = [kneeAng(L.lHip, L.lKn, L.lAn), kneeAng(L.rHip, L.rKn, L.rAn)].filter((v) => v !== null);
  m.kneeAngleMax = ka.length ? Math.max(...ka) : null;
  m.hipToAnkleY = ok(L.lAn, L.rAn) ? (((P[L.lAn].y + P[L.rAn].y) / 2) - midH.y) / torsoF : null;
  m.hipY = ok(L.lHip, L.rHip, L.lSh, L.rSh) ? midH.y / torsoF : null; // sinkt das Becken (Kniebeuge), steigt der Wert
  const elbAng = (sh, el, wr) => (ok(sh, el, wr) ? angle(P[sh], P[el], P[wr]) : null);
  const ea = [elbAng(L.lSh, L.lEl, L.lWr), elbAng(L.rSh, L.rEl, L.rWr)].filter((v) => v !== null);
  m.elbowAngleMin = ea.length ? Math.min(...ea) : null;
  m.elbowAngleMax = ea.length ? Math.max(...ea) : null;
  return m;
}

// ── Prüfungen ─────────────────────────────────────────────
// center: Standard-Zielwert; calib: Schlüssel der Kalibrierung (Skoliose: persönliche Referenz)
export const CHECKS = {
  shouldersLevel: { label: 'Schultern gleich hoch', metric: 'shoulderTilt', center: 0, tol: 3, calib: 'shoulderTilt', vis: 'shoulders', unit: '°', cueHigh: 'Linke Schulter sinken lassen', cueLow: 'Rechte Schulter sinken lassen', guide: { type: 'level', a: L.lSh, b: L.rSh }, bones: [[11, 12]] },
  pelvisLevel: { label: 'Becken gerade', metric: 'hipTilt', center: 0, tol: 3, calib: 'hipTilt', vis: 'hips', unit: '°', cueHigh: 'Linke Beckenseite sinken lassen, Gewicht auf beide Füße', cueLow: 'Rechte Beckenseite sinken lassen, Gewicht auf beide Füße', guide: { type: 'level', a: L.lHip, b: L.rHip }, bones: [[23, 24]] },
  trunkCentered: { label: 'Oberkörper mittig', metric: 'trunkShift', center: 0, tol: 0.06, calib: 'trunkShift', vis: 'shoulders', unit: '', cueHigh: 'Oberkörper etwas nach rechts zur Mitte', cueLow: 'Oberkörper etwas nach links zur Mitte', guide: { type: 'plumb' }, bones: [[11, 23], [12, 24]] },
  headCentered: { label: 'Kopf mittig', metric: 'headShift', center: 0, tol: 0.1, calib: 'headShift', vis: 'head', unit: '', cueHigh: 'Kopf etwas nach rechts zur Mitte', cueLow: 'Kopf etwas nach links zur Mitte', guide: { type: 'headPlumb' }, bones: [[7, 11], [8, 12]] },
  armsSymmetric: { label: 'Ellbogen gleich hoch', metric: 'elbowDiff', center: 0, tol: 0.15, vis: 'elbows', unit: '', cueHigh: 'Linken Ellbogen etwas höher', cueLow: 'Rechten Ellbogen etwas höher', guide: { type: 'level', a: L.lEl, b: L.rEl, push: 'up' }, bones: [[11, 13], [12, 14]] },
  wristsSymmetric: { label: 'Hände gleich hoch', metric: 'wristDiff', center: 0, tol: 0.18, vis: 'wrists', unit: '', cueHigh: 'Linke Hand etwas höher', cueLow: 'Rechte Hand etwas höher', guide: { type: 'level', a: L.lWr, b: L.rWr, push: 'up' }, bones: [[13, 15], [14, 16]] },
  trunkUpright: { label: 'Oberkörper aufrecht', metric: 'trunkLean', center: 0, tol: 10, vis: 'side', unit: '°', side: true, cueHigh: 'Oberkörper aufrichten', cueLow: 'Nicht nach hinten lehnen', guide: { type: 'sidePlumb' }, bones: [['S', 'H']] },
  earOverShoulder: { min: -0.2, max: 0.18, label: 'Kopf über den Schultern', metric: 'earForward', vis: 'ear', side: true, cueHigh: 'Kinn leicht einziehen, Hinterkopf nach oben', cueLow: null, guide: { type: 'earPlumb' }, bones: [['E', 'S']] },
  backFlat: { label: 'Rücken waagerecht', metric: 'torsoFromHorizontal', min: 0, max: 15, vis: 'side', side: true, cueHigh: 'Rücken waagerecht halten', cueLow: null, guide: { type: 'sideHorizontal' }, bones: [['S', 'H']] },
  handsUnderShoulders: { label: 'Hände unter Schultern', metric: 'handsUnderShoulders', min: 0, max: 0.3, vis: 'side', side: true, cueHigh: 'Hände unter die Schultern', cueLow: null, bones: [['S', 'W']] },
  kneesUnderHips: { label: 'Knie unter Hüfte', metric: 'kneesUnderHips', min: 0, max: 0.3, vis: 'sideLeg', side: true, cueHigh: 'Knie unter die Hüfte', cueLow: null, bones: [['H', 'K']] },
  hipExtended: { label: 'Becken oben', metric: 'hipAngle', min: 155, max: 200, vis: 'sideLeg', side: true, cueHigh: null, cueLow: 'Becken höher schieben, Gesäß anspannen', bones: [['S', 'H'], ['H', 'K']] },
  kneesSoft: { label: 'Knie leicht gebeugt', metric: 'kneeAngle', min: 140, max: 177, vis: 'sideLeg', side: true, cueHigh: 'Knie leicht beugen', cueLow: 'Knie weniger beugen', bones: [['H', 'K'], ['K', 'A']] },
  bodyLine: { label: 'Körper in einer Linie', metric: 'hipAngle', min: 158, max: 200, vis: 'sideLeg', side: true, cueHigh: null, cueLow: 'Hüfte nicht durchhängen lassen, Bauch fest', bones: [['S', 'H'], ['H', 'K']] },
  armLevel: { label: 'Arm waagerecht', metric: 'armLevel', center: 0, tol: 18, vis: 'side', side: true, optional: true, cueHigh: 'Arm etwas tiefer, auf Schulterhöhe', cueLow: 'Arm höher, auf Schulterhöhe', guide: { type: 'limbHorizontal', key: '_armIdx' }, bones: [] },
  legLevel: { label: 'Bein waagerecht', metric: 'legLevel', center: 0, tol: 15, vis: 'side', side: true, optional: true, cueHigh: 'Bein etwas tiefer, kein Hohlkreuz', cueLow: 'Bein höher, auf Hüfthöhe strecken', guide: { type: 'limbHorizontal', key: '_legIdx' }, bones: [] },
};

export const TOLERANCE = { streng: 0.7, normal: 1, locker: 1.4 };

/**
 * Bewertet eine Übung über die Zeit (Glättung + Hysterese).
 * settings: { tolerance, reference:'kalibriert'|'symmetrisch', correctionGoal, calib:{...} }
 */
export class PostureEvaluator {
  constructor(checkIds, settings) {
    this.checks = checkIds.map((id) => ({ id, ...CHECKS[id] })).filter((c) => c.metric);
    this.settings = settings || {};
    this.ema = {};
    this.badSince = {};
    this.state = {};
  }
  range(c) {
    const mult = TOLERANCE[this.settings.tolerance] || 1;
    if (c.min !== undefined || c.max !== undefined) {
      const lo = c.min ?? -Infinity, hi = c.max ?? Infinity;
      if (c.center === undefined) return { lo, hi, center: (lo + hi) / 2 };
    }
    let center = c.center;
    const cal = this.settings.calib;
    if (c.calib && cal && this.settings.reference === 'kalibriert' && typeof cal[c.calib] === 'number') {
      center = cal[c.calib] * (1 - (this.settings.correctionGoal ?? 0.3));
    }
    return { lo: center - c.tol * mult, hi: center + c.tol * mult, center };
  }
  update(metrics, now) {
    const out = [];
    for (const c of this.checks) {
      const raw = metrics ? metrics[c.metric] : null;
      const visible = metrics && (metrics._vis[c.vis] ?? 0) > 0.5 && raw !== null && raw !== undefined && Number.isFinite(raw);
      if (!visible) {
        delete this.badSince[c.id];
        out.push({ id: c.id, label: c.label, status: c.optional && metrics ? 'idle' : 'unknown' });
        continue;
      }
      const prev = this.ema[c.metric];
      const v = prev === undefined ? raw : prev + 0.35 * (raw - prev);
      this.ema[c.metric] = v;
      const r = this.range(c);
      let dirn = 0;
      if (v > r.hi) dirn = 1; else if (v < r.lo) dirn = -1;
      if (dirn) this.badSince[c.id] ??= now; else delete this.badSince[c.id];
      const sustained = dirn && now - this.badSince[c.id] > 1200;
      out.push({
        id: c.id, label: c.label, value: v, range: r, dir: dirn,
        status: !dirn ? 'ok' : sustained ? 'bad' : 'warn',
        cue: dirn > 0 ? c.cueHigh : dirn < 0 ? c.cueLow : null,
        badFor: dirn ? now - this.badSince[c.id] : 0,
        guide: c.guide, bones: c.bones, side: !!c.side,
      });
    }
    return out;
  }
}

export function frameScore(results) {
  const rel = results.filter((r) => r.status === 'ok' || r.status === 'warn' || r.status === 'bad');
  if (!rel.length) return null;
  return rel.reduce((s, r) => s + (r.status === 'ok' ? 1 : r.status === 'warn' ? 0.6 : 0), 0) / rel.length;
}

// ── Overlay ───────────────────────────────────────────────
export function drawOverlay(ctx, P, metrics, results, colors) {
  const W = ctx.canvas.width;
  ctx.clearRect(0, 0, W, ctx.canvas.height);
  if (!P) return;
  const lw = Math.max(2, W / 220);
  const badBones = new Set(), okBones = new Set();
  const sideIdx = metrics?._sideIdx || {};
  const resolve = (k) => (typeof k === 'number' ? k : sideIdx[k]);
  for (const r of results) {
    for (const b of r.bones || []) {
      const key = `${resolve(b[0])}-${resolve(b[1])}`;
      if (r.status === 'bad' || r.status === 'warn') badBones.add(key); else if (r.status === 'ok') okBones.add(key);
    }
  }
  // Skelett
  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    if (P[a].v < 0.4 || P[b].v < 0.4) continue;
    const key = `${a}-${b}`, key2 = `${b}-${a}`;
    ctx.strokeStyle = badBones.has(key) || badBones.has(key2) ? colors.bad : okBones.has(key) || okBones.has(key2) ? colors.ok : colors.neutral;
    ctx.lineWidth = lw * (badBones.has(key) || badBones.has(key2) ? 1.8 : 1.2);
    ctx.beginPath(); ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); ctx.stroke();
  }
  // feine Linien (Gesicht, Hände, Füße)
  ctx.strokeStyle = colors.neutral; ctx.lineWidth = lw * 0.6;
  for (const [a, b] of FINE) {
    if (P[a].v < 0.4 || P[b].v < 0.4) continue;
    ctx.beginPath(); ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); ctx.stroke();
  }
  // Wirbelsäule als Kette aus Wirbeln (Kopfmitte → Nacken → Becken)
  if (P[11].v > 0.4 && P[12].v > 0.4 && P[23].v > 0.4 && P[24].v > 0.4) {
    const ns = { x: (P[11].x + P[12].x) / 2, y: (P[11].y + P[12].y) / 2 }, ps = { x: (P[23].x + P[24].x) / 2, y: (P[23].y + P[24].y) / 2 };
    const hc = P[7].v > 0.4 && P[8].v > 0.4 ? { x: (P[7].x + P[8].x) / 2, y: (P[7].y + P[8].y) / 2 } : P[0];
    const trunkRes = results.find((r) => r.id === 'trunkCentered' || r.id === 'trunkUpright');
    const sc = trunkRes && (trunkRes.status === 'bad' || trunkRes.status === 'warn') ? colors.bad : trunkRes?.status === 'ok' ? colors.ok : colors.spine || colors.neutral;
    ctx.strokeStyle = sc; ctx.lineWidth = lw * 1.1;
    ctx.beginPath(); ctx.moveTo(hc.x, hc.y); ctx.lineTo(ns.x, ns.y); ctx.lineTo(ps.x, ps.y); ctx.stroke();
    ctx.fillStyle = sc;
    for (let k = 0; k <= 7; k++) {
      const t = k / 7, x = ns.x + (ps.x - ns.x) * t, y = ns.y + (ps.y - ns.y) * t;
      ctx.beginPath(); ctx.arc(x, y, lw * 1.0, 0, Math.PI * 2); ctx.fill();
    }
    for (let k = 1; k <= 2; k++) {
      const t = k / 3, x = hc.x + (ns.x - hc.x) * t, y = hc.y + (ns.y - hc.y) * t;
      ctx.beginPath(); ctx.arc(x, y, lw * 0.8, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (let i = 0; i < 33; i++) {
    if (P[i].v < 0.4) continue;
    const big = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].includes(i);
    ctx.fillStyle = colors.joint;
    ctx.beginPath(); ctx.arc(P[i].x, P[i].y, lw * (big ? 1.4 : 0.8), 0, Math.PI * 2); ctx.fill();
  }
  // Ziel-Hilfslinien (korrigierte Haltung)
  ctx.setLineDash([lw * 3, lw * 2.2]);
  for (const r of results) {
    if (!r.guide || r.status === 'unknown' || r.status === 'idle') continue;
    drawGuide(ctx, P, metrics, r, colors, lw);
  }
  finish();
  function finish() { ctx.setLineDash([]); }
}

function arrow(ctx, x1, y1, x2, y2, color, lw) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = lw * 5;
  ctx.save(); ctx.setLineDash([]); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw * 1.6;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - h * Math.cos(a - 0.5), y2 - h * Math.sin(a - 0.5)); ctx.lineTo(x2 - h * Math.cos(a + 0.5), y2 - h * Math.sin(a + 0.5)); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawGuide(ctx, P, m, r, colors, lw) {
  const g = r.guide, bad = r.status !== 'ok';
  ctx.strokeStyle = colors.target; ctx.lineWidth = lw;
  const LS = P[11], RS = P[12], LH = P[23], RH = P[24];
  const midS = { x: (LS.x + RS.x) / 2, y: (LS.y + RS.y) / 2 }, midH = { x: (LH.x + RH.x) / 2, y: (LH.y + RH.y) / 2 };
  const sw = Math.abs(LS.x - RS.x);
  if (g.type === 'level') {
    const A = P[g.a], B = P[g.b], c = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const half = Math.abs(A.x - B.x) / 2 + sw * 0.25;
    // Zielwinkel: Kalibrierung berücksichtigt (center in Grad), A ist linke Körperseite
    const ang = ((r.range?.center || 0) * Math.PI) / 180;
    const sgn = Math.sign(A.x - B.x) || 1;
    const dx = Math.cos(ang) * half, dy = Math.sin(ang) * half;
    ctx.beginPath(); ctx.moveTo(c.x + sgn * dx, c.y - dy); ctx.lineTo(c.x - sgn * dx, c.y + dy); ctx.stroke();
    if (bad) {
      if (g.push === 'up') { // tiefere Seite nach oben
        const lo = A.y > B.y ? A : B;
        arrow(ctx, lo.x, lo.y + sw * 0.35, lo.x, lo.y + sw * 0.08, colors.bad, lw);
      } else { // höhere Seite nach unten
        const hi = A.y < B.y ? A : B;
        arrow(ctx, hi.x, hi.y - sw * 0.35, hi.x, hi.y - sw * 0.08, colors.bad, lw);
      }
    }
  } else if (g.type === 'plumb') {
    ctx.beginPath(); ctx.moveTo(midH.x, midH.y); ctx.lineTo(midH.x, midS.y - sw * 0.6); ctx.stroke();
    if (bad) arrow(ctx, midS.x, midS.y - sw * 0.15, midS.x + (midH.x - midS.x) * 0.9, midS.y - sw * 0.15, colors.bad, lw);
  } else if (g.type === 'headPlumb') {
    ctx.beginPath(); ctx.moveTo(midS.x, midS.y); ctx.lineTo(midS.x, P[0].y - sw * 0.5); ctx.stroke();
    if (bad) arrow(ctx, P[0].x, P[0].y - sw * 0.3, P[0].x + (midS.x - P[0].x) * 0.9, P[0].y - sw * 0.3, colors.bad, lw);
  } else if (g.type === 'sidePlumb' || g.type === 'earPlumb') {
    const s = m._sideIdx, H = P[s.H], S = P[s.S], torso = Math.hypot(S.x - H.x, S.y - H.y);
    const base = g.type === 'sidePlumb' ? H : S;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(base.x, base.y - torso * (g.type === 'sidePlumb' ? 1.3 : 0.6)); ctx.stroke();
    if (bad) { const T = g.type === 'sidePlumb' ? S : P[s.E]; arrow(ctx, T.x, T.y, T.x + (base.x - T.x) * 0.8, T.y, colors.bad, lw); }
  } else if (g.type === 'sideHorizontal') {
    const s = m._sideIdx, H = P[s.H], S = P[s.S];
    ctx.beginPath(); ctx.moveTo(H.x, H.y); ctx.lineTo(S.x, H.y); ctx.stroke();
  } else if (g.type === 'limbHorizontal') {
    const idx = m[g.key]; if (!idx) return;
    const A = P[idx[0]], B = P[idx[1]], len = Math.hypot(B.x - A.x, B.y - A.y);
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(A.x + Math.sign(B.x - A.x) * len, A.y); ctx.stroke();
    if (bad) arrow(ctx, B.x, B.y, B.x, B.y + (A.y - B.y) * 0.8, colors.bad, lw);
  }
}

// Kompakte Momentaufnahme der Metriken (für Speicherung)
export function compactMetrics(m) {
  if (!m) return null;
  const keys = ['roll', 'dist', 'shoulderTilt', 'hipTilt', 'shoulderHipDiff', 'trunkShift', 'headShift', 'elbowDiff', 'wristDiff', 'trunkLean', 'hipAngle', 'kneeAngle', 'earForward', 'torsoFromHorizontal', 'armLevel', 'legLevel', 'wristsAboveHead', 'wristsAtShoulder', 'armsU', 'wristSpread', 'kneeLift', 'kneeOut', 'pelvisShift', 'footLift', 'neckLen', 'headDrop', 'wristAboveShoulder', 'hipAngleMin', 'hipAngleMax', 'kneeAngleMax', 'hipToAnkleY', 'hipY', 'elbowAngleMin', 'elbowAngleMax'];
  const o = {};
  for (const k of keys) if (m[k] !== null && m[k] !== undefined && Number.isFinite(m[k])) o[k] = Math.round(m[k] * 100) / 100;
  return o;
}
