// Bewegungsabläufe: animiertes Drahtgittermodell je Übung + Erkennung der Teilschritte (Phasen)
// Figurraum 200×200, Boden bei y=180. Winkel absolut in Grad: 0 = nach oben, 90 = nach rechts
// (Blickrichtung in der Seitenansicht), 180 = nach unten, 270 = nach links.

const LEN = { trunk: 50, neck: 20, head: 8, uArm: 25, fArm: 23, thigh: 34, shin: 34 };
const dir = (a) => [Math.sin((a * Math.PI) / 180), -Math.cos((a * Math.PI) / 180)];
const add = (p, a, l) => { const d = dir(a); return [p[0] + d[0] * l, p[1] + d[1] * l]; };

// ── Grundhaltungen ──
const SIDE = {
  stand: { hip: [100, 112], trunk: 0, head: 0, aU: 180, aF: 180, aU2: 180, aF2: 180, lU: 180, lL: 180, lU2: 180, lL2: 180 },
  sit: { hip: [86, 146], trunk: 0, head: 0, aU: 165, aF: 110, aU2: 165, aF2: 110, lU: 90, lL: 180, lU2: 90, lL2: 180 },
  kneel: { hip: [100, 146], trunk: 0, head: 0, aU: 180, aF: 180, aU2: 180, aF2: 180, lU: 90, lL: 180, lU2: 180, lL2: 270 },
  quad: { hip: [70, 146], trunk: 71, head: 105, aU: 180, aF: 180, aU2: 180, aF2: 180, lU: 180, lL: 270, lU2: 180, lL2: 270 },
  supine: { hip: [112, 172], trunk: 270, head: 270, aU: 90, aF: 90, aU2: 90, aF2: 90, lU: 45, lL: 150, lU2: 45, lL2: 150 },
  prone: { hip: [110, 174], trunk: 270, head: 270, aU: 270, aF: 270, aU2: 270, aF2: 270, lU: 90, lL: 90, lU2: 90, lL2: 90 },
  floorsit: { hip: [80, 170], trunk: 0, head: 0, aU: 165, aF: 140, aU2: 165, aF2: 140, lU: 90, lL: 90, lU2: 90, lL2: 90 },
};
const FRONT = {
  stand: { hip: [100, 112], trunk: 0, head: 0, lAU: 8, lAF: 6, rAU: 8, rAF: 6, lLU: 4, lLL: 2, rLU: 4, rLL: 2 },
  sit: { hip: [100, 134], trunk: 0, head: 0, lAU: 12, lAF: 30, rAU: 12, rAF: 30, lLU: 8, lLL: 4, rLU: 8, rLL: 4, lLs: 0.3, rLs: 0.3 },
  floorsit: { hip: [100, 164], trunk: 0, head: 0, lAU: 20, lAF: 40, rAU: 20, rAF: 40, lLU: 80, lLL: 150, rLU: 80, rLL: 150, lLs: 0.85, rLs: 0.75 },
};

function lerp(a, b, t) {
  if (Array.isArray(a)) return a.map((v, i) => v + (b[i] - v) * t);
  if (typeof a !== 'number' || typeof b !== 'number') return t < 0.5 ? a : b;
  return a + (b - a) * t;
}
export function blendPose(a, b, t) {
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = lerp(a[k] ?? b[k], b[k] ?? a[k], t);
  return o;
}

// ── Zeichnen ──
export function drawFigure(ctx, pose, view, opts = {}) {
  const W = ctx.canvas.width, s = W / 200;
  const col = opts.color || '#1F5FA8', far = opts.farColor || 'rgba(31,95,168,0.45)', ink = opts.propColor || 'rgba(120,130,128,0.9)';
  ctx.save();
  ctx.scale(s, s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Boden
  ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(10, 181); ctx.lineTo(190, 181); ctx.stroke();
  const props = opts.props || [];
  const seg = (pts, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke(); };
  const dot = (p, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); };
  let J;
  if (view === 'side') {
    const hip = pose.hip, sh = add(hip, pose.trunk, LEN.trunk), hd = add(sh, pose.head, LEN.neck);
    const arm = (u, f) => { const e = add(sh, u, LEN.uArm); return [sh, e, add(e, f, LEN.fArm)]; };
    const leg = (u, l, sc = 1) => { const k = add(hip, u, LEN.thigh * sc); return [hip, k, add(k, l, LEN.shin)]; };
    const A2 = arm(pose.aU2, pose.aF2), L2 = leg(pose.lU2, pose.lL2), A1 = arm(pose.aU, pose.aF), L1 = leg(pose.lU, pose.lL);
    if (props.includes('chair')) { seg([[hip[0] - 16, hip[1] + 4], [hip[0] + 18, hip[1] + 4]], ink, 3); seg([[hip[0] - 16, hip[1] + 4], [hip[0] - 16, 181]], ink, 2); seg([[hip[0] + 18, hip[1] + 4], [hip[0] + 18, 181]], ink, 2); seg([[hip[0] - 16, hip[1] + 4], [hip[0] - 16, hip[1] - 40]], ink, 2); }
    if (props.includes('wall')) seg([[184, 20], [184, 181]], ink, 4);
    if (props.includes('wallBack')) seg([[hip[0] - 14, 20], [hip[0] - 14, 181]], ink, 4);
    if (props.includes('hocker')) { ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(138, 142, 34, 39); }
    if (props.includes('roll')) { ctx.fillStyle = 'rgba(120,130,128,0.35)'; ctx.fillRect(48, hip[1] + 2, 66, 7); }
    if (props.includes('mat')) { ctx.fillStyle = 'rgba(31,95,168,0.10)'; ctx.fillRect(20, 178, 160, 3); }
    if (props.includes('stab')) seg([add(hip, pose.trunk + 180, 6), add(hip, pose.trunk, LEN.trunk + 26)].map((p) => [p[0] - 5, p[1]]), '#B87A0B', 3);
    seg(A2, far, 5); seg(L2, far, 6);
    seg([hip, sh], col, 7); seg([sh, hd], col, 5);
    seg(L1, col, 6); seg(A1, col, 5);
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.fillStyle = opts.bg || 'transparent';
    ctx.beginPath(); ctx.arc(hd[0], hd[1], LEN.head, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    J = { hip, sh, hd, wrist: A1[2], wrist2: A2[2], knee: L1[1], ankle: L1[2] };
    [hip, sh, A1[1], A1[2], L1[1], L1[2]].forEach((p) => dot(p, 2.6, opts.joint || col));
  } else {
    const hip = pose.hip, nb = add(hip, pose.trunk, LEN.trunk), hd = add(nb, pose.head, LEN.neck);
    const perp = (a, l) => add(nb, a + 90, l);
    const sh = pose.shrug || 0;
    const lS0 = perp(pose.trunk, 18), rS0 = add(nb, pose.trunk - 90, 18);
    const lS = [lS0[0], lS0[1] - sh], rS = [rS0[0], rS0[1] - sh];
    const lH = add(hip, pose.trunk + 90, 11), rH = add(hip, pose.trunk - 90, 11);
    const armL = (u, f, sc = 1) => { const e = add(lS, 180 - u, LEN.uArm * sc); return [lS, e, add(e, 180 - f, LEN.fArm * sc)]; };
    const armR = (u, f, sc = 1) => { const e = add(rS, 180 + u, LEN.uArm * sc); return [rS, e, add(e, 180 + f, LEN.fArm * sc)]; };
    const legL = (u, l, sc = 1) => { const k = add(lH, 180 - u, LEN.thigh * sc); return [lH, k, add(k, 180 - l, LEN.shin)]; };
    const legR = (u, l, sc = 1) => { const k = add(rH, 180 + u, LEN.thigh * sc); return [rH, k, add(k, 180 + l, LEN.shin)]; };
    const AL = armL(pose.lAU, pose.lAF, pose.lAs ?? 1), AR = armR(pose.rAU, pose.rAF, pose.rAs ?? 1), LL = legL(pose.lLU, pose.lLL, pose.lLs ?? 1), LR = legR(pose.rLU, pose.rLL, pose.rLs ?? 1);
    if (props.includes('chair')) { seg([[hip[0] - 26, hip[1] + 6], [hip[0] + 26, hip[1] + 6]], ink, 3); seg([[hip[0] - 24, hip[1] + 6], [hip[0] - 24, 181]], ink, 2); seg([[hip[0] + 24, hip[1] + 6], [hip[0] + 24, 181]], ink, 2); }
    if (props.includes('ball')) { ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hip[0], hip[1] + 24, 22, 0, Math.PI * 2); ctx.stroke(); }
    if (props.includes('wallBack')) { ctx.fillStyle = 'rgba(120,130,128,0.12)'; ctx.fillRect(40, 18, 120, 163); }
    if (props.includes('mat')) { ctx.fillStyle = 'rgba(31,95,168,0.10)'; ctx.fillRect(30, 176, 140, 5); }
    seg([lH, rH], col, 5); seg([lS, rS], col, 5);
    seg([hip, nb], col, 6); seg([nb, hd], col, 4);
    seg(LL, col, 6); seg(LR, col, 6); seg(AL, col, 5); seg(AR, col, 5);
    if (props.includes('band')) seg([AL[2], AR[2]], '#C2571A', 3);
    if (props.includes('weights')) [AL[2], AR[2]].forEach((p) => { ctx.fillStyle = '#5A6966'; ctx.fillRect(p[0] - 5, p[1] - 3, 10, 6); });
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.fillStyle = opts.bg || 'transparent';
    ctx.beginPath(); ctx.arc(hd[0], hd[1], LEN.head, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    [lS, rS, lH, rH, AL[1], AR[1], AL[2], AR[2], LL[1], LR[1], LL[2], LR[2]].forEach((p) => dot(p, 2.4, opts.joint || col));
    J = { hip, nb, hd, lw: AL[2], rw: AR[2] };
  }
  ctx.restore();
  return J;
}

// ── Prüf-Helfer für Phasen ──
// Jede Prüfung bekommt die Messwerte m und die Startwerte b (Median zu Beginn der Wiederholung).
// Rückgabe true/false, oder null wenn nicht messbar.
const has = (v) => v !== null && v !== undefined && Number.isFinite(v);
const lt = (k, x) => (m) => (has(m[k]) ? m[k] < x : null);
const gt = (k, x) => (m) => (has(m[k]) ? m[k] > x : null);
const absLt = (k, x) => (m) => (has(m[k]) ? Math.abs(m[k]) < x : null);
const relLt = (k, d) => (m, b) => (has(m[k]) && has(b?.[k]) ? m[k] < b[k] - d : null);
const relGt = (k, d) => (m, b) => (has(m[k]) && has(b?.[k]) ? m[k] > b[k] + d : null);
const all = (...fs) => (m, b) => { let r = true; for (const f of fs) { const v = f(m, b); if (v === null) return null; r = r && v; } return r; };
const any = (...fs) => (m, b) => { let seen = false; for (const f of fs) { const v = f(m, b); if (v === true) return true; if (v === false) seen = true; } return seen ? false : null; };

// ── Bewegungsdefinitionen ──
// kind 'cycle': Phasen nacheinander = ein Zyklus; 'hold': alle Phasen erreichen und halten.
// key: Pose-Überschreibungen für die Animation; test: Erkennung.
const S = (base, o = {}) => ({ ...SIDE[base], ...o });
const F = (base, o = {}) => ({ ...FRONT[base], ...o });

export const MOTIONS = {
  marschieren: { view: 'front', kind: 'cycle', cycleSec: 1.6, base: F('stand'), phases: [
    { id: 'l', label: 'Linkes Knie hoch', key: { lLs: 0.25, lLU: 0, lLL: 0, rAU: 40, lAU: 0 }, test: lt('kneeLiftL', 0.5) },
    { id: 'r', label: 'Rechtes Knie hoch', key: { rLs: 0.25, rLU: 0, rLL: 0, lAU: 40, rAU: 0 }, test: lt('kneeLiftR', 0.5) },
  ] },
  hueftkreisen: { view: 'front', kind: 'cycle', cycleSec: 4, base: F('stand', { lAU: 35, lAF: 150, rAU: 35, rAF: 150 }), phases: [
    { id: 'l', label: 'Becken nach links', key: { hip: [108, 112], trunk: -6 }, test: gt('pelvisShift', 0.12) },
    { id: 'r', label: 'Becken nach rechts', key: { hip: [92, 112], trunk: 6 }, test: lt('pelvisShift', -0.12) },
  ] },
  beckenbalance: { view: 'side', kind: 'cycle', cycleSec: 5, base: S('sit'), props: ['chair'], phases: [
    { id: 'rund', label: 'Rundrücken', key: { trunk: -12, head: 15 }, test: relLt('trunkLean', 4) },
    { id: 'hohl', label: 'Hohlkreuz', key: { trunk: 8, head: 0 }, test: relGt('trunkLean', 3) },
    { id: 'mitte', label: 'Aufrecht in der Mitte', key: { trunk: 0 }, test: absLt('trunkLean', 6) },
  ] },
  schulterkreisen: { view: 'front', kind: 'cycle', cycleSec: 3, base: F('stand'), phases: [
    { id: 'hoch', label: 'Schultern hochziehen', key: { shrug: 7, lAU: 6, rAU: 6 }, test: relLt('neckLen', 0.08) },
    { id: 'tief', label: 'Nach hinten unten', key: { shrug: -2, lAU: 10, rAU: 10 }, test: relGt('neckLen', -0.02) },
  ] },
  katze_kuh: { view: 'side', kind: 'cycle', cycleSec: 5, base: S('quad'), props: ['mat'], phases: [
    { id: 'rund', label: 'Rücken rund, Kinn zur Brust', key: { trunk: 78, head: 160, hip: [70, 140] }, test: gt('headDrop', 0.3) },
    { id: 'lang', label: 'Brustbein nach vorn, Blick vor', key: { trunk: 68, head: 75 }, test: lt('headDrop', 0.12) },
  ] },
  nadel_einfaedeln: { view: 'side', kind: 'cycle', cycleSec: 6, base: S('quad'), props: ['mat'], phases: [
    { id: 'ein', label: 'Arm einfädeln', key: { trunk: 82, head: 150, aU: 230, aF: 250 }, test: gt('headDrop', 0.25) },
    { id: 'auf', label: 'Arm zur Decke öffnen', key: { trunk: 68, head: 60, aU: 0, aF: 0 }, test: gt('wristAboveShoulder', 0.45) },
  ] },
  wandengel: { view: 'front', kind: 'cycle', cycleSec: 4, base: F('stand', { lAU: 90, lAF: 180, rAU: 90, rAF: 180 }), props: ['wallBack'], phases: [
    { id: 'u', label: 'Arme in U-Form', key: { lAU: 90, lAF: 180, rAU: 90, rAF: 180 }, test: gt('armsU', 0.5) },
    { id: 'oben', label: 'Arme nach oben gleiten', key: { lAU: 160, lAF: 175, rAU: 160, rAF: 175 }, test: gt('wristsAboveHead', 1.5) },
  ] },
  kinn_einziehen: { view: 'side', kind: 'hold', base: S('sit', { head: 18 }), props: ['chair'], phases: [
    { id: 'kinn', label: 'Kinn nach hinten, Hinterkopf hoch', key: { head: -4, hip: [86, 146] }, test: lt('earForward', 0.14) },
  ] },
  bws_stuhllehne: { view: 'side', kind: 'hold', base: S('sit', { aU: 20, aF: 200, aU2: 20, aF2: 200 }), props: ['chair'], phases: [
    { id: 'streck', label: 'Brustbein nach oben strecken', key: { trunk: -14, head: -20 }, test: lt('trunkLean', -6) },
  ] },
  rolle_laengs: { view: 'side', kind: 'hold', base: S('supine', { hip: [112, 165], head: 268, aU: 265, aF: 268 }), props: ['roll', 'mat'], phases: [
    { id: 'lage', label: 'Rückenlage auf der Rolle', key: {}, test: gt('lying', 0.5) },
  ] },
  ball_beckenkreisen: { view: 'front', kind: 'cycle', cycleSec: 4, base: F('sit', { lAU: 30, lAF: 150, rAU: 30, rAF: 150 }), props: ['ball'], phases: [
    { id: 'l', label: 'Becken nach links', key: { hip: [107, 134], trunk: -5 }, test: gt('pelvisShift', 0.1) },
    { id: 'r', label: 'Becken nach rechts', key: { hip: [93, 134], trunk: 5 }, test: lt('pelvisShift', -0.1) },
  ] },
  hueftbeuger_halbknie: { view: 'side', kind: 'hold', base: S('kneel'), props: ['mat'], phases: [
    { id: 'auf', label: 'Oberkörper aufrecht', key: { trunk: 0 }, test: absLt('trunkLean', 10) },
    { id: 'vor', label: 'Becken nach vorn schieben', key: { hip: [108, 148], lU: 80, lL: 195, lU2: 205, lL2: 270 }, test: gt('hipAngleMax', 162) },
  ] },
  hueftbeuger_stand: { view: 'side', kind: 'hold', base: S('stand', { hip: [100, 120], lU: 145, lL: 180, lU2: 215, lL2: 215 }), phases: [
    { id: 'auf', label: 'Oberkörper aufrecht', key: { trunk: 0 }, test: absLt('trunkLean', 10) },
    { id: 'vor', label: 'Becken nach vorn schieben', key: { hip: [106, 122], lU: 135, lL: 180, lU2: 222, lL2: 222 }, test: gt('hipAngleMax', 163) },
  ] },
  neunzig_neunzig: { view: 'front', kind: 'hold', base: F('floorsit', { lLU: 90, lLL: 180, rLU: 100, rLL: 20 }), props: ['mat'], phases: [
    { id: 'sitz', label: 'Am Boden, Beine 90/90', key: {}, test: lt('hipToAnkleY', 0.45) },
    { id: 'auf', label: 'Aufrecht, Schultern gerade', key: { head: 0 }, test: absLt('shoulderTilt', 5) },
  ] },
  piriformis_ruecken: { view: 'side', kind: 'hold', base: S('supine'), props: ['mat'], phases: [
    { id: 'zieh', label: 'Bein zur Brust ziehen', key: { lU: 15, lL: 120, aU: 40, aF: 80 }, test: lt('hipAngleMin', 85) },
  ] },
  piriformis_sitz: { view: 'side', kind: 'hold', base: S('sit'), props: ['chair'], phases: [
    { id: 'vor', label: 'Langer Rücken, nach vorn neigen', key: { trunk: 28, head: 30 }, test: gt('trunkLean', 14) },
  ] },
  beckenheben: { view: 'side', kind: 'hold', base: S('supine'), props: ['mat'], phases: [
    { id: 'oben', label: 'Becken hoch: Knie–Hüfte–Schulter in Linie', key: { hip: [110, 155], trunk: 245, head: 268, aU: 70, aF: 85, lU: 70, lL: 165, lU2: 70, lL2: 165 }, test: gt('hipAngleMax', 155) },
  ] },
  hueftbeugen_stab: { view: 'side', kind: 'cycle', cycleSec: 4, base: S('stand', { aU: 200, aF: 340 }), props: ['stab'], phases: [
    { id: 'beug', label: 'Gesäß nach hinten, Oberkörper neigen', key: { hip: [92, 118], trunk: 50, head: 60, lU: 165, lL: 175, lU2: 165, lL2: 175 }, test: gt('trunkLean', 28) },
    { id: 'auf', label: 'Aufrichten', key: { trunk: 0 }, test: lt('trunkLean', 10) },
  ] },
  knie_brust: { view: 'side', kind: 'hold', base: S('supine', { lU2: 90, lL2: 90 }), props: ['mat'], phases: [
    { id: 'zieh', label: 'Knie zur Brust', key: { lU: 345, lL: 150, aU: 20, aF: 70 }, test: lt('hipAngleMin', 75) },
  ] },
  schmetterling: { view: 'front', kind: 'hold', base: F('floorsit', { lLU: 70, lLL: 200, rLU: 70, rLL: 200 }), props: ['mat'], phases: [
    { id: 'auf', label: 'Fußsohlen zusammen, Knie sinken', key: { lLU: 88, rLU: 88 }, test: gt('kneeSpread', 2.6) },
    { id: 'gerade', label: 'Aufrecht sitzen', key: {}, test: absLt('shoulderTilt', 5) },
  ] },
  hueftrotation_stand: { view: 'front', kind: 'cycle', cycleSec: 4, base: F('stand', { rAU: 60, rAF: 80 }), phases: [
    { id: 'hoch', label: 'Knie anheben', key: { lLs: 0.3, lLU: 0, lLL: 0 }, test: lt('kneeLift', 0.5) },
    { id: 'aus', label: 'Knie nach außen kreisen', key: { lLs: 0.6, lLU: 70, lLL: 10 }, test: gt('kneeOut', 1.1) },
    { id: 'ab', label: 'Bein abstellen', key: {}, test: gt('kneeLift', 0.7) },
  ] },
  vierfuessler_diagonal: { view: 'side', kind: 'hold', base: S('quad'), props: ['mat'], phases: [
    { id: 'arm', label: 'Arm waagerecht nach vorn', key: { aU: 90, aF: 90 }, test: (m) => (has(m.armLevel) ? Math.abs(m.armLevel) < 22 : false) },
    { id: 'bein', label: 'Gegenüberliegendes Bein strecken', key: { lU2: 270, lL2: 270 }, test: (m) => (has(m.legLevel) ? Math.abs(m.legLevel) < 18 : false) },
    { id: 'ruecken', label: 'Rücken bleibt ruhig', key: {}, test: lt('torsoFromHorizontal', 22) },
  ] },
  dead_bug: { view: 'side', kind: 'cycle', cycleSec: 5, base: S('supine', { aU: 0, aF: 0, aU2: 0, aF2: 0, lU: 0, lL: 90, lU2: 0, lL2: 90 }), props: ['mat'], phases: [
    { id: 'ab', label: 'Arm & Bein langsam absenken', key: { aU: 300, aF: 290, lU: 75, lL: 85 }, test: gt('kneeAngleMax', 150) },
    { id: 'zur', label: 'Zurück zur Mitte', key: {}, test: lt('kneeAngleMax', 120) },
  ] },
  grundspannung_sitz: { view: 'front', kind: 'hold', base: F('sit', { hip: [100, 136] }), props: ['chair'], phases: [
    { id: 'lang', label: 'Scheitel nach oben wachsen', key: { hip: [100, 132] }, test: relLt('noseY', 0.02) },
    { id: 'gerade', label: 'Schultern gleich hoch', key: {}, test: absLt('shoulderTilt', 4) },
  ] },
  aufrichtung_stand: { view: 'front', kind: 'hold', base: F('stand', { hip: [100, 114] }), phases: [
    { id: 'lang', label: 'Lang werden', key: { hip: [100, 110] }, test: relLt('noseY', 0.02) },
    { id: 'gerade', label: 'Schultern & Becken gerade', key: {}, test: all(absLt('shoulderTilt', 4), absLt('hipTilt', 4)) },
  ] },
  nacken_druck: { view: 'front', kind: 'hold', base: F('sit', { lAU: 125, lAF: 215, rAU: 125, rAF: 215 }), props: ['chair'], phases: [
    { id: 'haende', label: 'Hände hinter dem Kopf', key: {}, test: gt('handsBehindHead', 1.5) },
    { id: 'mitte', label: 'Kopf bleibt mittig', key: {}, test: absLt('headShift', 0.15) },
  ] },
  arme_seit_kreise: { view: 'front', kind: 'hold', base: F('stand', { lAU: 90, lAF: 90, rAU: 90, rAF: 90 }), phases: [
    { id: 'hoehe', label: 'Arme auf Schulterhöhe', key: { lAU: 95, lAF: 92, rAU: 85, rAF: 88 }, test: gt('wristsAtShoulder', 1.5) },
    { id: 'gerade', label: 'Schultern gleich hoch', key: { lAU: 85, lAF: 88, rAU: 95, rAF: 92 }, test: absLt('shoulderTilt', 4) },
  ] },
  hampelmann_sitz: { view: 'front', kind: 'cycle', cycleSec: 3, base: F('sit', { lAU: 90, lAF: 180, rAU: 90, rAF: 180 }), props: ['chair'], phases: [
    { id: 'oben', label: 'Arme über dem Kopf zusammen', key: { lAU: 165, lAF: 200, rAU: 165, rAF: 200 }, test: gt('wristsAboveHead', 1.5) },
    { id: 'unten', label: 'Zurück auf Schulterhöhe', key: {}, test: gt('armsU', 0.5) },
  ] },
  band_zug: { view: 'front', kind: 'cycle', cycleSec: 3, base: F('stand', { lAU: 75, lAF: 40, rAU: 75, rAF: 40, lAs: 0.55, rAs: 0.55 }), props: ['band'], phases: [
    { id: 'aus', label: 'Band auseinanderziehen', key: { lAU: 88, lAF: 92, rAU: 88, rAF: 92, lAs: 1, rAs: 1 }, test: gt('wristSpread', 2.6) },
    { id: 'zur', label: 'Kontrolliert zurück', key: {}, test: lt('wristSpread', 2.0) },
  ] },
  band_kopf: { view: 'front', kind: 'cycle', cycleSec: 4, base: F('sit', { lAU: 150, lAF: 175, rAU: 150, rAF: 175 }), props: ['chair', 'band'], phases: [
    { id: 'hinter', label: 'Band hinter den Kopf', key: { lAU: 95, lAF: 175, rAU: 95, rAF: 175 }, test: gt('armsU', 0.5) },
    { id: 'hoch', label: 'Wieder nach oben', key: {}, test: gt('wristsAboveHead', 1.5) },
  ] },
  hantel_u: { view: 'front', kind: 'cycle', cycleSec: 3, base: F('stand', { lAU: 90, lAF: 180, rAU: 90, rAF: 180 }), props: ['weights'], phases: [
    { id: 'u', label: 'U-Form, Oberarme waagerecht', key: {}, test: gt('armsU', 0.5) },
    { id: 'hoch', label: 'Nach oben drücken', key: { lAU: 160, lAF: 175, rAU: 160, rAF: 175 }, test: gt('wristsAboveHead', 1.5) },
  ] },
  bauchlage_schwimmen: { view: 'side', kind: 'hold', base: S('prone'), props: ['mat'], phases: [
    { id: 'lage', label: 'Bauchlage', key: {}, test: gt('lying', 0.5) },
    { id: 'heben', label: 'Arme leicht anheben', key: { aU: 250, aF: 252, head: 255 }, test: gt('wristAboveShoulder', 0.06) },
  ] },
  bauchlage_spannung: { view: 'side', kind: 'hold', base: S('prone'), props: ['mat'], phases: [
    { id: 'lage', label: 'Bauchlage', key: {}, test: gt('lying', 0.5) },
    { id: 'kopf', label: 'Kopf etwas anheben, lang machen', key: { head: 252, lL: 92, lL2: 92 }, test: gt('noseAboveShoulder', 0.03) },
  ] },
  ball_beinheben: { view: 'front', kind: 'hold', base: F('sit'), props: ['ball'], phases: [
    { id: 'fuss', label: 'Fuß leicht anheben', key: { lLs: 0.1, lLL: 25 }, test: gt('footLift', 0.08) },
    { id: 'gerade', label: 'Becken bleibt gerade', key: {}, test: absLt('hipTilt', 5) },
  ] },
  stufenlagerung_wand: { view: 'side', kind: 'hold', base: S('supine', { lU: 0, lL: 90, lU2: 0, lL2: 90 }), props: ['mat', 'hocker'], phases: [
    { id: 'lage', label: 'Rückenlage, Beine 90°', key: {}, test: all(gt('lying', 0.5), lt('hipAngleMin', 125)) },
  ] },
  stufenlagerung: { view: 'side', kind: 'hold', base: S('supine', { lU: 0, lL: 90, lU2: 0, lL2: 90 }), props: ['mat', 'hocker'], phases: [
    { id: 'lage', label: 'Rückenlage, Beine 90°', key: {}, test: all(gt('lying', 0.5), lt('hipAngleMin', 125)) },
  ] },
  kindhaltung: { view: 'side', kind: 'hold', base: S('quad'), props: ['mat'], phases: [
    { id: 'sink', label: 'Gesäß zu den Fersen, Arme lang', key: { hip: [72, 164], trunk: 100, head: 110, aU: 95, aF: 90, aU2: 95, aF2: 90, lU: 117, lL: 270, lU2: 117, lL2: 270 }, test: lt('hipAngleMin', 70) },
  ] },
  flankenatmung: { view: 'front', kind: 'hold', base: F('stand', { lAU: 25, lAF: 160, rAU: 25, rAF: 160 }), phases: [
    { id: 'haende', label: 'Hände an die Rippen', key: {}, test: gt('wristsAtRibs', 0.5) },
    { id: 'lang', label: 'In die Flanken atmen, lang bleiben', key: { hip: [100, 111] }, test: absLt('shoulderTilt', 4) },
  ] },
  kniebeugen: { view: 'front', kind: 'cycle', cycleSec: 3.5, base: F('stand'), phases: [
    { id: 'tief', label: 'Gesäß nach hinten unten', key: { hip: [100, 140], lLs: 0.45, rLs: 0.45, lLU: 14, rLU: 14, lLL: 2, rLL: 2, lAU: 70, rAU: 70, lAF: 80, rAF: 80, lAs: 0.5, rAs: 0.5 }, test: (m, b) => (has(m.hipY) && has(b?.hipYMin) ? m.hipY > b.hipYMin + 0.18 : null) },
    { id: 'hoch', label: 'Wieder aufrichten', key: {}, test: (m, b) => (has(m.hipY) && has(b?.hipYMin) ? m.hipY < b.hipYMin + 0.07 : null) },
  ] },
  kniebeugen_stuhl: { view: 'front', kind: 'cycle', cycleSec: 4, base: F('stand'), props: ['chair'], phases: [
    { id: 'tief', label: 'Langsam zum Stuhl', key: { hip: [100, 140], lLs: 0.35, rLs: 0.35, lLU: 12, rLU: 12, lLL: 2, rLL: 2, lAU: 70, rAU: 70, lAF: 80, rAF: 80, lAs: 0.5, rAs: 0.5 }, test: (m, b) => (has(m.hipY) && has(b?.hipYMin) ? m.hipY > b.hipYMin + 0.2 : null) },
    { id: 'hoch', label: 'Gleichmäßig aufstehen', key: {}, test: (m, b) => (has(m.hipY) && has(b?.hipYMin) ? m.hipY < b.hipYMin + 0.07 : null) },
  ] },
  liegestuetz_wand: { view: 'side', kind: 'cycle', cycleSec: 3, base: S('stand', { hip: [92, 114], trunk: 22, head: 22, aU: 85, aF: 90, aU2: 85, aF2: 90, lU: 200, lL: 200, lU2: 200, lL2: 200 }), props: ['wall'], phases: [
    { id: 'beug', label: 'Arme beugen, Brust zur Wand', key: { hip: [102, 112], trunk: 28, head: 28, aU: 140, aF: 50, aU2: 140, aF2: 50 }, test: lt('elbowAngleMin', 115) },
    { id: 'drueck', label: 'Wegdrücken', key: {}, test: gt('elbowAngleMax', 155) },
  ] },
  liegestuetz_knie: { view: 'side', kind: 'cycle', cycleSec: 3, base: S('quad', { hip: [70, 150], trunk: 73, head: 85, lU: 205, lL: 270, lU2: 205, lL2: 270 }), props: ['mat'], phases: [
    { id: 'beug', label: 'Brust kontrolliert zum Boden', key: { hip: [70, 162], trunk: 82, head: 88, aU: 150, aF: 210, aU2: 150, aF2: 210 }, test: lt('elbowAngleMin', 115) },
    { id: 'drueck', label: 'Hochdrücken', key: {}, test: gt('elbowAngleMax', 155) },
  ] },
};

// Keyframe-Folge für die Animation
export function keyframes(motion) {
  const base = motion.base;
  const ks = [{ pose: base, label: 'Ausgangsposition', hold: 0.6 }];
  let cur = base;
  for (const ph of motion.phases) {
    cur = { ...cur, ...ph.key };
    ks.push({ pose: cur, label: ph.label, phase: ph.id, hold: motion.kind === 'hold' ? 1.6 : 0.5 });
  }
  return ks;
}

// Animation in ein Canvas, liefert stop()
export function animate(canvas, motion, opts = {}) {
  const ctx = canvas.getContext('2d');
  const ks = keyframes(motion);
  const move = opts.move ?? 0.9;
  const seq = [...ks, { ...ks[0], label: ks[0].label }];
  const durs = seq.map((k) => move + (k.hold || 0.4));
  const total = durs.reduce((a, b) => a + b, 0);
  let raf = 0, stopped = false;
  const t0 = performance.now();
  const frame = (now) => {
    if (stopped) return;
    let t = ((now - t0) / 1000) % total, i = 0;
    while (t > durs[i]) { t -= durs[i]; i++; }
    const cur = seq[i], nxt = seq[(i + 1) % seq.length];
    const f = t < (cur.hold || 0.4) ? 0 : (t - (cur.hold || 0.4)) / move;
    const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    const pose = blendPose(cur.pose, nxt.pose, e);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const status = opts.status?.() || {};
    const activeId = f < 0.5 ? cur.phase : nxt.phase;
    const color = activeId && status[activeId] === true ? (opts.okColor || '#2E8B57') : (opts.color || '#1F5FA8');
    drawFigure(ctx, pose, motion.view, { ...opts, color, props: motion.props || [] });
    opts.onLabel?.(f < 0.5 ? cur.label : nxt.label, activeId);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}

// ── Erkennung der Teilschritte je Wiederholung ──
export class MotionTracker {
  constructor(motion, item) {
    this.motion = motion; this.item = item;
    this.reset(0);
  }
  reset(now) {
    this.t0 = now; this.base = null; this.baseBuf = [];
    this.reached = Object.fromEntries(this.motion.phases.map((p) => [p.id, false]));
    this.live = Object.fromEntries(this.motion.phases.map((p) => [p.id, null]));
    this.measurable = Object.fromEntries(this.motion.phases.map((p) => [p.id, false]));
    this.seq = 0; this.cycles = 0; this.holdMs = 0; this.evalMs = 0; this.last = now;
    this.firstReachMs = null;
    this.trueSince = {}; this.lastCycleAt = now; this.hipYMin = null; this.seqChanged = false;
  }
  update(m, now) {
    const dt = Math.min(250, now - this.last); this.last = now;
    if (!m) return;
    if (!this.base) {
      this.baseBuf.push(m);
      if (now - this.t0 > 800 && this.baseBuf.length >= 4) {
        const keys = ['trunkLean', 'neckLen', 'noseY', 'pelvisShift', 'hipY'];
        this.base = {};
        for (const k of keys) {
          const v = this.baseBuf.map((x) => x[k]).filter(has).sort((a, b) => a - b);
          if (v.length) this.base[k] = v[Math.floor(v.length / 2)];
        }
      }
    }
    // Stehhöhe: kleinster Beckenwert der Wiederholung (robust, auch wenn man schon in Bewegung startet)
    if (has(m.hipY)) this.hipYMin = this.hipYMin === null ? m.hipY : Math.min(this.hipYMin + 0.0004 * dt / 16, m.hipY);
    const b = { ...(this.base || {}), hipYMin: this.hipYMin };
    const res = {};
    for (const p of this.motion.phases) {
      const raw = p.test ? p.test(m, b) : null;
      // Entprellen: eine Phase gilt erst, wenn sie 250 ms stabil erkannt wird
      if (raw === true) this.trueSince[p.id] ??= now; else delete this.trueSince[p.id];
      const v = raw === true ? now - this.trueSince[p.id] >= 250 : raw;
      res[p.id] = v; this.live[p.id] = v;
      if (raw !== null) this.measurable[p.id] = true;
    }
    this.seqChanged = false;
    if (this.motion.kind === 'cycle') {
      const ph = this.motion.phases[this.seq];
      const minCycle = (this.motion.cycleSec || 4) * 400; // ein Durchgang nicht schneller als 40 % der Sollzeit
      const isLast = this.seq === this.motion.phases.length - 1;
      if (res[ph.id] === true && (!isLast || now - this.lastCycleAt >= minCycle)) {
        this.reached[ph.id] = true;
        this.seq++; this.seqChanged = true;
        if (this.seq >= this.motion.phases.length) { this.cycles++; this.seq = 0; this.lastCycleAt = now; }
      }
      // Phasen außer der Reihe zählen als erreicht, aber nicht als Zyklus
      for (const p of this.motion.phases) if (res[p.id] === true) this.reached[p.id] = true;
    } else {
      const vals = Object.values(res);
      const allTrue = vals.length && vals.every((v) => v === true || v === null) && vals.some((v) => v === true);
      for (const p of this.motion.phases) if (res[p.id] === true) this.reached[p.id] = true;
      if (now - this.t0 > 1500) {
        this.evalMs += dt;
        if (allTrue) { this.holdMs += dt; this.firstReachMs ??= now - this.t0; }
      }
    }
  }
  // aktuelles Ergebnis der Wiederholung
  result(postureScore) {
    const ph = this.motion.phases;
    const measurable = ph.filter((p) => this.measurable[p.id]);
    const coverage = measurable.length ? measurable.filter((p) => this.reached[p.id]).length / measurable.length : null;
    let phaseScore = null, expected = null;
    if (measurable.length) {
      if (this.motion.kind === 'cycle') {
        expected = Math.max(1, Math.floor(this.item.hold / (this.motion.cycleSec || 4)));
        phaseScore = 0.4 * coverage + 0.6 * Math.min(1, this.cycles / expected);
      } else {
        const held = this.evalMs ? this.holdMs / this.evalMs : 0;
        phaseScore = 0.4 * coverage + 0.6 * held;
      }
    }
    const parts = [phaseScore, postureScore].filter(has);
    const score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
    const r3 = (v) => (has(v) ? Math.round(v * 1000) / 1000 : null);
    return {
      phases: Object.fromEntries(ph.map((p) => [p.id, this.measurable[p.id] ? this.reached[p.id] : null])),
      cycles: this.motion.kind === 'cycle' ? this.cycles : null, expectedCycles: expected,
      holdRatio: this.motion.kind === 'hold' && this.evalMs ? r3(this.holdMs / this.evalMs) : null,
      reachMs: this.firstReachMs !== null ? Math.round(this.firstReachMs) : null,
      phaseScore: r3(phaseScore), postureScore: r3(postureScore), score: r3(score),
    };
  }
}
