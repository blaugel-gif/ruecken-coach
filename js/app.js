import { EQUIPMENT, byId } from './exercises.js?v=202610192125';
import { suggestions, buildCustomPlan, MODES, defaultModeForHour } from './planner.js?v=202610192125';
import { cameraSetupSVG, cameraText } from './camera-svg.js?v=202610192125';
import { loadPoseModel, pickPose, toPoints, computeMetrics, PostureEvaluator, frameScore, drawOverlay, compactMetrics, CHECKS } from './pose.js?v=202610192125';
import { Speaker, SessionRunner, scriptTexts } from './coach.js?v=202610192125';
import { Store, DEFAULT_SETTINGS, SCHEMA_VERSION } from './store.js?v=202610192125';
import { renderDashboard } from './dashboard.js?v=202610192125';
import * as neural from './neuralvoice.js?v=202610192125';
import { computeBalance, rankExercises, focusGroups, agoText, WINDOW_MIN } from './balance.js?v=202610192125';
import { MUSCLES } from './exercises.js?v=202610192125';
import { MOTIONS, MotionTracker, animate as animateMotion } from './motion.js?v=202610192125';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAY = 864e5;
const dkey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const fmtMin = (sec) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const OVERLAY_COLORS = { ok: '#2FBF71', bad: '#F0483E', neutral: 'rgba(255,255,255,0.7)', joint: '#FFFFFF', target: '#FFE14D' };

const store = new Store();
let settings = { ...DEFAULT_SETTINGS };
let hist = [];
const ui = { mode: defaultModeForHour(new Date().getHours()), variant: 0, reroll: 0, plans: [], authMode: 'login' };

function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function show(view) {
  $$('.view').forEach((v) => { v.hidden = v.id !== `v-${view}`; });
  const tabbed = ['home', 'dash', 'settings', 'pick'].includes(view);
  $('#tabs').hidden = !tabbed;
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === (view === 'pick' ? 'home' : view)));
  window.scrollTo(0, 0);
}

// ── Start ───────────────────────────────────────────────
// Neue Version vorhanden? Dann einmal neu laden (Handys halten sonst die alte Version im Cache)
async function checkVersion() {
  try {
    const mine = document.querySelector('meta[name="app-version"]')?.content;
    const live = (await (await fetch(`version.txt?t=${Date.now()}`, { cache: 'no-store' })).text()).trim();
    if (live && mine && live !== mine && sessionStorage.getItem('rc_reloaded') !== live) {
      sessionStorage.setItem('rc_reloaded', live);
      location.reload();
      return true;
    }
  } catch { /* offline: weiter mit dieser Version */ }
  return false;
}

async function boot() {
  if (await checkVersion()) return;
  if (!store.configured) { show('setup'); return; }
  try { await store.init(); } catch (e) { show('setup'); setMsg('#setup-msg', e.message, true); return; }
  if (!store.local && !store.user) { show('auth'); return; }
  await enterApp();
}

function setMsg(sel, text, err = false) { const el = $(sel); el.textContent = text || ''; el.classList.toggle('err', !!err); }

async function enterApp() {
  try { settings = await store.loadSettings(); } catch { settings = { ...DEFAULT_SETTINGS }; }
  if (store.cloud && store.queueLength) {
    const n = await store.flushQueue();
    if (n) toast(`${n} gespeicherte Einheit${n === 1 ? '' : 'en'} hochgeladen.`);
  }
  hist = await store.history();
  renderHome();
  renderSettings();
  show('home');
}

$('#f-setup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('#cfg-url').value.trim().replace(/\/+$/, '');
  const key = $('#cfg-key').value.trim();
  if (!/^https:\/\/.+/.test(url)) { setMsg('#setup-msg', 'Die Project URL beginnt mit https://', true); return; }
  store.configure({ url, key });
  try { await store.init(); setMsg('#setup-msg', ''); show('auth'); } catch (err) { setMsg('#setup-msg', err.message, true); }
});
$('#b-local').addEventListener('click', async () => { store.configure({ local: true }); await store.init(); await enterApp(); toast('Testmodus: Daten bleiben nur auf diesem Gerät.'); });
$('#b-reconfig').addEventListener('click', () => { store.resetConfig(); show('setup'); });

function setAuthMode(m) {
  ui.authMode = m;
  $('#t-login').classList.toggle('on', m === 'login'); $('#t-register').classList.toggle('on', m === 'register');
  $('#t-login').setAttribute('aria-selected', m === 'login'); $('#t-register').setAttribute('aria-selected', m === 'register');
  $('#au-submit').textContent = m === 'login' ? 'Anmelden' : 'Konto anlegen';
  $('#au-pw').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#au-hint').textContent = m === 'login' ? 'Mindestens 10 Zeichen.' : 'Vergib ein eigenes Passwort mit mindestens 10 Zeichen. Es schützt deine Daten.';
}
$('#t-login').addEventListener('click', () => setAuthMode('login'));
$('#t-register').addEventListener('click', () => setAuthMode('register'));
$('#f-auth').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#au-email').value.trim(), pw = $('#au-pw').value;
  setMsg('#auth-msg', 'Einen Moment …');
  try {
    if (ui.authMode === 'register') {
      await store.signUp(email, pw);
      if (!store.user) { setMsg('#auth-msg', 'Konto angelegt. Bestätige die E-Mail von Supabase und melde dich dann an.'); setAuthMode('login'); return; }
    } else {
      await store.signIn(email, pw);
    }
    setMsg('#auth-msg', '');
    await enterApp();
  } catch (err) {
    const m = /Invalid login/i.test(err.message) ? 'E-Mail oder Passwort stimmt nicht.' : /not confirmed/i.test(err.message) ? 'Bitte bestätige zuerst die E-Mail von Supabase.' : err.message;
    setMsg('#auth-msg', m, true);
  }
});

$$('.tab').forEach((t) => t.addEventListener('click', async () => {
  const v = t.dataset.view;
  if (v === 'dash') { show('dash'); renderDashboard($('#dash'), hist); hist = await store.history(); renderDashboard($('#dash'), hist); return; }
  if (v === 'settings') renderSettings();
  if (v === 'home') renderHome();
  show(v);
}));

// ── Startseite ──────────────────────────────────────────
function recentMap() {
  const today = new Date(dkey(new Date()));
  const map = {};
  for (const s of hist) {
    const d = Math.round((today - new Date(dkey(s.started_at))) / DAY);
    for (const e of s.exercises || []) if (!e.skipped) map[e.id] = Math.min(map[e.id] ?? 99, d);
  }
  return map;
}

function cameraMoves(plan) {
  let n = 0, prev = null;
  for (const it of plan.items) { const k = `${it.view}|${it.pos}`; if (prev && k !== prev) n++; prev = k; }
  return n;
}

function renderHome() {
  const now = new Date();
  $('#home-date').textContent = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const h = now.getHours();
  $('#home-greet').textContent = h < 11 ? 'Guten Morgen. Zeit, die Hüfte zu lösen.' : h < 15 ? 'Kurze Pause für den Rücken?' : h < 19 ? 'Fünf Atemzüge Aufrichtung zwischendurch?' : 'Den Tag locker ausklingen lassen.';
  $$('.mode').forEach((b) => { const on = +b.dataset.mode === ui.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  ui.bal = computeBalance(hist);
  ui.need = Object.fromEntries(rankExercises(ui.bal, settings.equipment).map((r) => [r.ex.id, r.score]));
  ui.plans = suggestions({ mode: ui.mode, equipment: settings.equipment, date: dkey(now), recent: recentMap(), intensity: settings.intensity, reroll: ui.reroll, floorAtNoon: settings.floorAtNoon, need: ui.need });
  const foc = focusGroups(ui.bal, 3);
  $('#focusbar').innerHTML = ui.bal.windowSec
    ? `<span>Lange nicht dran:</span>${foc.map((g) => `<span class="tag need">${esc(g.label)}</span>`).join('')}`
    : '<span>Noch keine Trainingsdaten – die Vorschläge decken erst einmal alle Bereiche ab.</span>';
  $('#suggestions').innerHTML = ui.plans.map((p, i) => {
    const live = p.items.filter((it) => byId[it.id].checks.length).length;
    return `<button class="sug ${i === ui.variant ? 'on' : ''}" data-i="${i}" type="button" aria-pressed="${i === ui.variant}">
      <span class="sname">${esc(p.variantName)}</span><span class="stime">${fmtMin(p.seconds)}</span>
      <span class="slist">${p.items.map((it) => esc(it.name)).join(' · ')}</span>
      <span class="smeta">${p.needScore !== null && p.needScore !== undefined ? `<span class="tag need">Bedarf ${Math.round(p.needScore * 100)} %</span>` : ''}<span class="tag">${p.items.length} Übungen</span><span class="tag">${live} mit Live-Prüfung</span><span class="tag">${cameraMoves(p)}× Kamera umstellen</span></span>
    </button>`;
  }).join('');
  $$('.sug').forEach((b) => b.addEventListener('click', () => { ui.variant = +b.dataset.i; renderHome(); }));
  renderPlanDetail();
  const eq = settings.equipment.map((id) => EQUIPMENT.find((e) => e.id === id)?.label).filter(Boolean);
  $('#equip-hint').textContent = eq.length ? `Hilfsmittel: ${eq.join(', ')}` : 'Ohne Hilfsmittel. In den Einstellungen kannst du welche auswählen.';
  const sync = $('#sync-state');
  if (store.local) { sync.textContent = 'nur lokal'; sync.className = 'pill warn'; }
  else if (store.queueLength) { sync.textContent = `${store.queueLength} nicht synchronisiert`; sync.className = 'pill warn'; }
  else { sync.textContent = 'gesichert'; sync.className = 'pill ok'; }
}

function renderPlanDetail() {
  const p = ui.plans[ui.variant];
  const el = $('#plan-detail');
  if (!p) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<h3>Ablauf „${esc(p.variantName)}“</h3><ol>${p.items.map((it) => {
    const ex = byId[it.id];
    return `<li>${cameraSetupSVG(ex)}<div><div class="pname">${esc(ex.name)}</div><div class="pdose">${doseText(it)}</div><div class="pdose">${esc(cameraText(ex))}</div></div></li>`;
  }).join('')}</ol>`;
}

function doseText(it) {
  const reps = it.type === 'hold' ? `${it.reps} × ${it.hold} s halten` : `${it.reps} × ${it.hold} s Bewegung`;
  const rest = it.reps > 1 && it.rest ? `, ${it.rest} s Pause` : '';
  return `${reps}${rest}${it.sides > 1 ? ', je Seite' : ''}`;
}

$$('.mode').forEach((b) => b.addEventListener('click', () => { ui.mode = +b.dataset.mode; ui.variant = 0; renderHome(); }));
$('#b-reroll').addEventListener('click', () => { ui.reroll++; renderHome(); });
$('#b-start').addEventListener('click', () => { ui.customPlan = null; show('checkin'); });

// ── Übungsauswahl (Menü) ──
ui.picked = [];
function renderPick() {
  const bal = computeBalance(hist);
  const groups = Object.values(bal.groups);
  const max = Math.max(...groups.map((g) => g.sec), 1);
  const fairSec = bal.windowSec / groups.length;
  $('#pick-window').textContent = bal.windowSec
    ? `Ausgewertet: ${Math.round(bal.windowSec / 60)} von ${WINDOW_MIN} Minuten (die jüngsten Übungen zuerst). Der Strich zeigt den gleichmäßigen Anteil.`
    : 'Noch keine Trainingszeit gespeichert. Alle Bereiche gelten als offen.';
  $('#pick-bars').innerHTML = groups.sort((a, b) => b.need - a.need).map((g) => `
    <div class="mbar ${g.need > 0.6 ? 'low' : ''}">
      <span class="mname">${esc(g.label)}</span>
      <span class="track"><span class="fill" style="width:${(g.sec / max) * 100}%"></span>${bal.windowSec ? `<span class="fair" style="left:${Math.min(100, (fairSec / max) * 100)}%"></span>` : ''}</span>
      <span class="mval">${Math.round(g.sec / 60 * 10) / 10} Min · ${agoText(g.days)}</span>
    </div>`).join('');
  const ranked = rankExercises(bal, settings.equipment);
  const cat = ui.pickCat || 'alle';
  const cats = { alle: 'Alle', ...{ mobility: 'Mobilisation', hip: 'Hüfte', stability: 'Kräftigung', posture: 'Aufrichtung', relax: 'Entspannung', warmup: 'Aufwärmen' } };
  $('#pick-filter').innerHTML = Object.entries(cats).map(([k, v]) => `<label class="chip"><input type="radio" name="pick-cat" id="pc-${k}" value="${k}" ${k === cat ? 'checked' : ''}><span>${v}</span></label>`).join('');
  $$('#pick-filter input').forEach((i) => i.addEventListener('change', () => { ui.pickCat = i.value; renderPick(); }));
  $('#pick-list').innerHTML = ranked.filter((r) => cat === 'alle' || r.ex.cat === cat).map((r, i) => {
    const on = ui.picked.includes(r.ex.id);
    const pos = ui.picked.indexOf(r.ex.id);
    return `<li class="pick ${on ? 'on' : ''}">
      <span class="rank">${i + 1}</span>
      <div><div class="pname">${esc(r.ex.name)}</div>
        <div class="pmeta"><span>${r.ex.muscles.map((m) => esc(MUSCLES[m])).join(' · ')}</span><span>zuletzt ${agoText(r.days)}</span></div>
        <div class="need" title="Bedarf ${Math.round(r.score * 100)} %"><i style="width:${Math.round(r.score * 100)}%"></i></div></div>
      <button class="add" type="button" data-id="${r.ex.id}" aria-pressed="${on}" aria-label="${on ? 'Entfernen' : 'Hinzufügen'}">${on ? pos + 1 : '+'}</button>
    </li>`;
  }).join('');
  $$('#pick-list .add').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.id;
    ui.picked = ui.picked.includes(id) ? ui.picked.filter((x) => x !== id) : [...ui.picked, id];
    renderPick();
  }));
  const plan = ui.picked.length ? buildCustomPlan(ui.picked, { intensity: settings.intensity, date: dkey(new Date()) }) : null;
  $('#pick-sum').textContent = plan ? `${plan.items.length} Übung${plan.items.length === 1 ? '' : 'en'} · ca. ${fmtMin(plan.seconds)} Min` : 'Tippe auf +, um Übungen in die Runde zu legen';
  $('#b-pick-start').disabled = !plan;
  ui.customPlan = plan;
}
$('#b-pick').addEventListener('click', () => { renderPick(); show('pick'); });
$('#b-pick-back').addEventListener('click', () => { renderHome(); show('home'); });
$('#b-pick-start').addEventListener('click', () => { if (ui.customPlan) show('checkin'); });
$('#b-ci-back').addEventListener('click', () => { stopDc(); if (ui.customPlan) { renderPick(); show('pick'); } else show('home'); });
function syncOut(id) { $(`#${id}-o`).textContent = $(`#${id}`).value; }

// ── Training ────────────────────────────────────────────
let S = null; // laufende Einheit

$('#b-ci-go').addEventListener('click', () => { stopDc(); startSession(); });

async function startSession() {
  const plan = ui.customPlan || ui.plans[ui.variant];
  const speaker = new Speaker(settings);
  speaker.unlock();
  const devMode = $('#dev-toggle').checked;
  S = {
    plan, speaker, devMode, t0: performance.now(), startedAt: new Date(),
    id: crypto.randomUUID(),
    items: plan.items.map((it) => ({ ...it, workSec: 0, frames: 0, inFrame: 0, scored: 0, scoreSum: 0, cues: 0, badFrames: {}, mSum: {}, mN: 0, flags: 0, repResults: [] })),
    repRows: [], tracker: null, repPosture: { n: 0, sum: 0 }, repStart: 0, raiseSince: null, prevCenter: null, stopPrepAnim: null, stopMiniAnim: null, miniFor: null, roll: null,
    samples: [], lastSample: 0, check: [], evaluator: null, results: [], metrics: null, P: null,
    dev: devMode ? { env: {}, events: [], notes: { flags: [] } } : null, snapshots: [], snappedSteps: new Set(),
    lastSeen: performance.now(), lastFrameWarn: 0, fps: { n: 0, t: performance.now(), value: 0 }, lastLm: 0,
    stream: null, landmarker: null, raf: 0, wake: null, lastDetect: 0, prevStep: null,
  };
  $('#c-flag').hidden = !devMode;
  $('#c-mute').textContent = settings.mute ? 'Ton an' : 'Ton aus';
  show('session');
  $('#camstatus').textContent = 'Kamera wird gestartet …';
  window.onerror = (m, src, line) => devLog('error', { m: String(m), src, line });

  if (S.dev) S.dev.env = { ua: navigator.userAgent, screen: [screen.width, screen.height, devicePixelRatio], settings: { ...settings, calib: settings.calib }, plan: plan.items.map((i) => i.id), secure: window.isSecureContext, standalone: matchMedia('(display-mode: standalone)').matches };
  speaker.log = devLog;
  try { S.wake = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
  if (settings.voiceEngine === 'neural' && !(await neural.isInstalled())) {
    devLog('neural_missing', {}); settings.voiceEngine = 'system'; toast('Eingebaute Stimme nicht gefunden – nutze Handy-Sprachausgabe.');
  }
  if (settings.voiceEngine === 'neural') speaker.prefetch(scriptTexts(plan, settings));
  else await speaker.ready();
  devLog('permission_camera', { state: await cameraPermission() });

  await startCamera();
  if (!S) return; // während des Ladens beendet

  S.runner = new SessionRunner({
    plan, settings: { ...settings, prep: MODES[plan.mode].prep }, speaker,
    onStep: onStep, onTick: onTick, onFinish: () => finishSession(true), log: devLog,
  });
  S.runner.start();
  loop();
}

async function cameraPermission() {
  try { return (await navigator.permissions.query({ name: 'camera' })).state; } catch { return 'unbekannt'; }
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('getUserMedia fehlt'), { name: 'NotSupportedError' });
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: settings.camera, width: { ideal: 1920 }, height: { ideal: 1080 }, resizeMode: 'none' }, audio: false });
  } catch (e) {
    // Manche Geräte scheitern an den Auflösungswünschen: einfach nochmal ohne
    if (e.name === 'OverconstrainedError' || e.name === 'NotReadableError') return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    throw e;
  }
}

function cameraHelp(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    return `<p><strong>Chrome selbst darf die Kamera nicht benutzen.</strong> Das ist eine Android-Einstellung, nicht die der Webseite:</p>
      <ol><li>Chrome-Menü (⋮) → <strong>Einstellungen → Website-Einstellungen → Kamera</strong>.</li>
      <li>Unten auf den roten Link <strong>„Android-Einstellungen“</strong> tippen.</li>
      <li><strong>Berechtigungen → Kamera → „Nur während der Nutzung der App zulassen“</strong>.</li>
      <li>Zurück zur App, Seite neu laden, beim Start auf <strong>Zulassen</strong> tippen.</li></ol>`;
  }
  if (n === 'NotReadableError') return '<p><strong>Die Kamera ist belegt.</strong> Schließ andere Apps, die die Kamera nutzen (Videoanruf, Kamera-App), und versuch es erneut.</p>';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return '<p><strong>Keine passende Kamera gefunden.</strong> Stell in den Einstellungen die andere Kamera ein (Front/Rück).</p>';
  return `<p><strong>Kamera konnte nicht starten</strong> (${esc(n || String(e))}).</p>`;
}

async function startCamera() {
  $('#camfail').hidden = true;
  $('#camstatus').textContent = 'Kamera wird gestartet …';
  try {
    S.stream = await openCamera();
    const v = $('#video'); v.srcObject = S.stream; await v.play();
    $('#stage').classList.toggle('mirror', settings.camera === 'user');
    const track = S.stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() || {};
    // So weitwinklig wie möglich (kleinster Zoom), damit der ganze Körper ins Bild passt
    if (caps.zoom && typeof caps.zoom.min === 'number') { try { await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] }); } catch (e) { devLog('zoom_error', { e: String(e) }); } }
    devLog('camera', { settings: track.getSettings?.(), label: track.label, zoom: caps.zoom || null, w: caps.width?.max, h: caps.height?.max });
  } catch (e) {
    devLog('camera_error', { e: String(e), name: e?.name, permission: await cameraPermission() });
    $('#camstatus').textContent = '';
    $('#camfail-txt').innerHTML = `${cameraHelp(e)}<p>Das Training läuft so lange mit Sprachansagen weiter.</p>`;
    $('#camfail').hidden = false;
    S.speaker.say('Ich kann die Kamera nicht öffnen. Das Training läuft trotzdem mit Ansagen.');
    return;
  }
  if (!S.landmarker) {
    $('#camstatus').textContent = 'Haltungserkennung wird geladen …';
    try {
      S.landmarker = await loadPoseModel(settings.model, devLog);
      $('#camstatus').textContent = '';
    } catch (e) {
      devLog('model_error', { e: String(e) });
      $('#camstatus').textContent = 'Haltungserkennung nicht verfügbar. Training läuft mit Ansagen.';
      setTimeout(() => { if (S) $('#camstatus').textContent = ''; }, 5000);
    }
  }
}
$('#b-cam-retry').addEventListener('click', () => { if (S) startCamera(); });

// ── Geräteprüfung vor dem Training ──
let dcStream = null, dcSpeaker = null;
function dcSet(which, cls, text) { $(`#dc-${which}-dot`).className = `dc-dot ${cls}`; $(`#dc-${which}`).textContent = text; }
function voiceHelp(sp) {
  const noDe = sp && sp.supported && sp.voicesCount > 0 && sp.deVoices === 0;
  return `<p><strong>${noDe ? 'Auf dem Handy ist keine deutsche Stimme installiert.' : 'Die Sprachausgabe des Handys bleibt stumm.'}</strong> So richtest du sie ein:</p>
    <p>Das ist eine Einstellung von Android, nicht von Chrome (die „Sprachen“ in Chrome sind dafür nicht zuständig).</p>
    <ol><li>Android-<strong>Einstellungen</strong> öffnen und oben in die Suche <strong>„Sprachausgabe“</strong> eintippen (manche Geräte: „Text-in-Sprache“ oder „TTS“).</li>
    <li>Bevorzugte Engine: <strong>Sprachdienste von Google</strong>. Fehlt sie: im Play Store „Speech Services by Google“ installieren oder aktualisieren.</li>
    <li>Über das Zahnrad neben der Engine → <strong>Sprachdaten installieren → Deutsch (Deutschland)</strong> herunterladen.</li>
    <li>Mit <strong>„Beispiel anhören“</strong> testen, Medienlautstärke hochdrehen, Chrome ganz schließen und die App neu öffnen.</li></ol>`;
}
function stopDc() { dcStream?.getTracks().forEach((t) => t.stop()); dcStream = null; $('#dc-video').hidden = true; }

function dcDiag(st) {
  const el = $('#dc-diag');
  el.hidden = false;
  el.textContent = `Diagnose: ${st.supported ? '' : 'keine Sprachausgabe im Browser · '}Stimmen ${st.voices} (deutsch ${st.de}) · gewählt: ${st.compat ? 'Systemstandard' : (st.voice || 'keine')} · gestartet ${st.started} · beendet ${st.ended} · Fehler ${st.errors}${st.lastError ? ' (' + st.lastError + ')' : ''}`;
}
function saveDevcheck(extra = {}) {
  ui.devcheck = { ...(ui.devcheck || {}), ...extra, at: new Date().toISOString(), ua: navigator.userAgent, speech: dcSpeaker?.stats() || null, cam: $('#dc-cam').textContent };
  settings.lastDevcheck = ui.devcheck;
  store.saveSettings(settings).catch(() => {});
}
function dcSpeakTest(compat) {
  dcSpeaker = new Speaker({ ...settings, mute: false, speechCompat: compat });
  dcSpeaker.unlock();
  dcSpeaker.say(compat ? 'Zweiter Versuch. Hörst du mich jetzt?' : 'Hallo. Wenn du mich hörst, tippe auf: Stimme gehört.');
}

$('#b-devcheck').addEventListener('click', async () => {
  const help = [];
  $('#dc-help').hidden = true; $('#dc-voice-ask').hidden = true; ui.dcCompatTried = false;
  // Ton zuerst, solange die Nutzergeste frisch ist
  dcSpeakTest(!!settings.speechCompat);
  dcSet('voice', 'warn', 'Sprachansage: läuft …');
  dcSet('cam', 'warn', 'Kamera: wird geöffnet …');
  stopDc();
  try {
    dcStream = await openCamera();
    const v = $('#dc-video'); v.srcObject = dcStream; v.hidden = false; await v.play();
    dcSet('cam', 'ok', 'Kamera: funktioniert');
  } catch (e) {
    dcSet('cam', 'bad', `Kamera: blockiert (${e?.name || e})`);
    help.push(cameraHelp(e));
  }
  await dcSpeaker.ready();
  setTimeout(() => {
    const st = dcSpeaker.stats();
    dcDiag(st);
    if (!st.supported) { dcSet('voice', 'bad', 'Sprachansage: Browser unterstützt keine Sprachausgabe'); help.push(voiceHelp(dcSpeaker)); }
    else { dcSet('voice', 'warn', 'Sprachansage: Hast du eine Stimme gehört?'); $('#dc-voice-ask').hidden = false; }
    if (help.length) { $('#dc-help').innerHTML = help.join('<hr>'); $('#dc-help').hidden = false; }
    saveDevcheck({ heard: null });
  }, 3000);
});
$('#b-heard-yes').addEventListener('click', () => {
  dcSet('voice', 'ok', 'Sprachansage: funktioniert');
  $('#dc-voice-ask').hidden = true;
  if (ui.dcCompatTried || dcSpeaker?.switchedToCompat) { settings.speechCompat = true; toast('Kompatibilitätsmodus für Ansagen eingeschaltet.'); }
  dcDiag(dcSpeaker.stats());
  saveDevcheck({ heard: true, compatWorked: ui.dcCompatTried || undefined });
});
$('#b-heard-no').addEventListener('click', () => {
  dcDiag(dcSpeaker.stats());
  if (!ui.dcCompatTried && settings.voiceEngine !== 'neural') {
    // zweiter Versuch ohne feste Stimme, direkt in der Nutzergeste
    ui.dcCompatTried = true;
    saveDevcheck({ heard: false, mode: settings.speechCompat ? 'compat' : 'voice' });
    dcSpeakTest(!settings.speechCompat);
    dcSet('voice', 'warn', 'Sprachansage: zweiter Versuch – hörst du jetzt etwas?');
    setTimeout(() => dcDiag(dcSpeaker.stats()), 2500);
    return;
  }
  dcSet('voice', 'bad', 'Sprachansage: nicht hörbar');
  $('#dc-voice-ask').hidden = true;
  saveDevcheck({ heard: false, compatHeard: false });
  if (settings.voiceEngine !== 'neural') $('#dc-neural').hidden = false;
  const h = $('#dc-help'); h.innerHTML = (h.hidden ? '' : h.innerHTML + '<hr>') + voiceHelp(dcSpeaker); h.hidden = false;
});

async function installNeural(statusEl, btn) {
  // Audio sofort in der Tipp-Geste freischalten, sonst bleibt sie nach dem langen Download gesperrt
  const sp = new Speaker({ ...settings, mute: false, voiceEngine: 'neural' }, (ev, d) => { if (ev === 'neural_error') statusEl.textContent = `Fehler: ${d.e}`; });
  sp.unlock();
  btn.disabled = true;
  statusEl.textContent = 'Wird geladen …';
  try {
    await neural.install((f, txt) => { statusEl.textContent = `Download: ${Math.round(f * 100)} % (${txt})`; });
    statusEl.textContent = 'Stimme wird getestet …';
    settings.voiceEngine = 'neural';
    await store.saveSettings(settings).catch(() => {});
    sp.say('Hallo, ich bin deine eingebaute Stimme. Ab jetzt sage ich dir die Übungen an.');
    statusEl.textContent = 'Fertig. Die eingebaute Stimme ist aktiv. Du solltest sie gleich hören (der erste Satz dauert ein paar Sekunden).';
    renderSettings();
    return true;
  } catch (e) {
    statusEl.textContent = `Download fehlgeschlagen: ${e?.message || e}. Prüfe die Internetverbindung und versuch es erneut.`;
    return false;
  } finally { btn.disabled = false; }
}
$('#b-dc-neural').addEventListener('click', async () => {
  const ok = await installNeural($('#dc-neural-st'), $('#b-dc-neural'));
  if (ok) { dcSet('voice', 'warn', 'Sprachansage: eingebaute Stimme – hörst du sie?'); $('#dc-voice-ask').hidden = false; ui.dcCompatTried = true; }
  saveDevcheck({ neuralInstalled: ok });
});

function devLog(ev, data = {}) {
  if (!S?.dev) return;
  if (S.dev.events.length > 6000) return;
  S.dev.events.push({ t: Math.round(performance.now() - S.t0), ev, ...data });
}

// Neigung des Handys (Kamera schief?) aus dem Beschleunigungssensor
window.addEventListener('devicemotion', (e) => {
  if (!S) return;
  const g = e.accelerationIncludingGravity; if (!g || g.x === null) return;
  const a = ((screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI) / 180;
  const x = g.x * Math.cos(a) + g.y * Math.sin(a), y = -g.x * Math.sin(a) + g.y * Math.cos(a);
  const r = (Math.atan2(x, y) * 180) / Math.PI;
  S.roll = S.roll === null ? r : S.roll + 0.1 * (r - S.roll);
  S.upright = Math.abs(g.z ?? 0) < 6;
});

function evalSettings(extra = {}) {
  return { tolerance: settings.tolerance, reference: settings.reference, correctionGoal: settings.correctionGoal, calib: settings.calib, ...extra };
}

function onStep(step) {
  // vorherigen Arbeitsschritt verbuchen
  const prev = S.prevStep;
  if (prev && prev.kind === 'work') { S.items[prev.idx].workSec += Math.min(prev.duration, S.lastWorkEl || 0); finalizeRep(prev, step); }
  if (prev && prev.kind === 'check') finishPostureCheck();
  S.prevStep = step; S.lastWorkEl = 0;
  S.raiseSince = null;
  const mot = step.item ? MOTIONS[step.item.id] : null;
  if (step.kind === 'work') {
    S.tracker = mot ? new MotionTracker(mot, step.item) : null;
    S.tracker?.reset(performance.now());
    S.repPosture = { n: 0, sum: 0 }; S.repStart = performance.now();
  }
  // Animation in der Vorbereitung
  S.stopPrepAnim?.(); S.stopPrepAnim = null;
  if (step.kind === 'prep' && mot) {
    $('#prep-animfig').hidden = false;
    $('#prep-phases').innerHTML = mot.phases.map((p) => `<li data-ph="${p.id}">${esc(p.label)}</li>`).join('');
    S.stopPrepAnim = animateMotion($('#prep-anim'), mot, {
      color: '#E7ECEA', farColor: 'rgba(231,236,234,0.45)', propColor: 'rgba(200,210,208,0.7)', joint: '#FFE14D', bg: 'rgba(11,15,15,0.9)',
      onLabel: (label, id) => { $('#prep-anim-label').textContent = label; $$('#prep-phases li').forEach((li) => li.classList.toggle('on', li.dataset.ph === id)); },
    });
  } else if (step.kind === 'prep' || step.kind === 'check') { $('#prep-animfig').hidden = true; }
  $('#readybar').hidden = !(step.kind === 'prep' && step.waiting);
  // Mini-Animation während der Übung
  const showMini = mot && ['work', 'rest', 'switch'].includes(step.kind);
  $('#motion').hidden = !showMini;
  if (showMini && S.miniFor !== step.item.id) {
    S.stopMiniAnim?.();
    S.miniFor = step.item.id;
    S.stopMiniAnim = animateMotion($('#motion-anim'), mot, {
      color: '#BFD3EE', farColor: 'rgba(191,211,238,0.4)', propColor: 'rgba(200,210,208,0.6)', joint: '#FFE14D', okColor: '#2FBF71', bg: 'rgba(0,0,0,0.6)',
      status: () => (S?.tracker ? S.tracker.reached : {}),
      onLabel: (label) => { const el = $('#motion-label'); if (el.textContent !== label) el.textContent = label; },
    });
    renderRepDots(step.idx);
  }
  if (!showMini && S.stopMiniAnim) { S.stopMiniAnim(); S.stopMiniAnim = null; S.miniFor = null; }
  if (showMini) { renderMotionPhases(mot); renderRepDots(step.idx); }
  if (!showMini) { $('#far-phases').innerHTML = ''; }
  $('#hud-cue').textContent = step.kind === 'work' && step.item ? byId[step.item.id].cue : '';

  const it = step.item;
  if (step.kind === 'prep') S.evaluator = new PostureEvaluator(byId[it.id].checks, evalSettings());
  if (step.kind === 'check') S.evaluator = new PostureEvaluator(['shouldersLevel', 'pelvisLevel', 'trunkCentered', 'headCentered'], evalSettings({ reference: 'symmetrisch' }));

  const phase = { check: 'Haltungs-Check', prep: 'Vorbereitung', work: it?.type === 'hold' ? 'Halten' : 'Bewegen', rest: 'Pause', switch: 'Seitenwechsel', done: 'Fertig' }[step.kind];
  $('#hud-phase').textContent = phase;
  $('#hud-name').textContent = step.kind === 'check' ? 'Frontal zur Kamera stellen' : it ? it.name : 'Geschafft';
  const total = S.plan.items.length;
  $('#hud-prog').textContent = it ? `${step.idx + 1}/${total}` : '';
  $('#reps').textContent = step.kind === 'work' || step.kind === 'rest'
    ? `Wdh. ${step.rep + 1}/${it.reps}${it.sides > 1 ? ` · Seite ${step.side + 1}/2` : ''}` : '';

  const prep = $('#prep');
  if (step.kind === 'prep' || step.kind === 'check') {
    const ex = step.kind === 'check' ? { name: 'Haltungs-Check', view: 'front', pos: 'stand', cam: { height: 'Brusthöhe', dist: '2–2,5 m' }, steps: ['Frontal zur Kamera stellen, ganzer Körper im Bild.', 'Arme locker hängen lassen, normal stehen.', 'Fünf Sekunden ruhig bleiben, ich messe deine Ausgangshaltung.'] } : byId[it.id];
    $('#prep-eyebrow').textContent = step.kind === 'check' ? 'Zum Start' : `Übung ${step.idx + 1} von ${total}`;
    $('#prep-name').textContent = ex.name;
    $('#prep-dose').textContent = step.kind === 'check' ? 'Ca. 12 Sekunden' : doseText(it);
    $('#prep-feel').innerHTML = step.kind === 'check' || !ex.feel ? '' : `<strong>Spüren:</strong> ${esc(ex.feel)} <br><strong>Muskeln:</strong> ${esc((ex.muscles || []).map((g) => MUSCLES[g]).join(', '))}`;
    $('#prep-cam').innerHTML = cameraSetupSVG(ex);
    $('#prep-camtxt').textContent = cameraText(ex);
    $('#prep-steps').innerHTML = ex.steps.map((s) => `<li>${esc(s)}</li>`).join('');
    S.expectView = ex.view;
    prep.hidden = false;
  } else {
    prep.hidden = true;
  }
  if (step.kind === 'done') $('#timer').textContent = '✓';
}

function onTick(step, el, left) {
  if (step.kind === 'done') return;
  $('#timer').textContent = Number.isFinite(left) ? Math.max(0, left) : '';
  if (step.kind === 'work') S.lastWorkEl = el;
  // Haltungs-Check: Ende des Schritts sauber verbuchen
  if (step.kind === 'check' && el > 5 && el < 11.5 && S.metrics && S.metrics._frontal > 0.4 && S.metrics._vis.shoulders > 0.6 && S.metrics._vis.hips > 0.5) {
    const m = S.metrics;
    S.check.push({ shoulderTilt: m.shoulderTilt, hipTilt: m.hipTilt, trunkShift: m.trunkShift, headShift: m.headShift });
  }
}

function finishPostureCheck() {
  if (S.check.length < 5) { S.postureCheck = null; devLog('posture_check_failed', { n: S.check.length }); return; }
  const med = (k) => { const a = S.check.map((c) => c[k]).filter(Number.isFinite).sort((x, y) => x - y); return a.length ? Math.round(a[Math.floor(a.length / 2)] * 100) / 100 : null; };
  S.postureCheck = { shoulderTilt: med('shoulderTilt'), hipTilt: med('hipTilt'), trunkShift: med('trunkShift'), headShift: med('headShift'), n: S.check.length };
  devLog('posture_check', S.postureCheck);
  if (!settings.calib) {
    settings.calib = { ...S.postureCheck, at: new Date().toISOString() };
    store.saveSettings(settings).catch(() => {});
    S.speaker.say('Deine Ausgangshaltung ist jetzt als Referenz gespeichert.');
  }
}

function loop() {
  if (!S) return;
  S.raf = requestAnimationFrame(loop);
  const now = performance.now();
  const v = $('#video');
  const step = S.runner?.step;
  if (!S.landmarker || v.readyState < 2 || !v.videoWidth) return;
  if (now - S.lastDetect < 1000 / 18) return;
  S.lastDetect = now;
  const cv = $('#overlay');
  if (cv.width !== v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
  let res;
  try { res = S.landmarker.detectForVideo(v, now); } catch (e) { devLog('detect_error', { e: String(e) }); return; }
  const pick = pickPose(res?.landmarks, S.prevCenter);
  const lm = pick.lm;
  if (lm) S.prevCenter = pick.center;
  if (pick.jumped) { S.personJumps = (S.personJumps || 0) + 1; devLog('person_jump', { n: pick.n }); }
  if (pick.n > 1 && now - (S.lastMulti || 0) > 10000) { S.lastMulti = now; devLog('multi_person', { n: pick.n, chosen: pick.idx }); }
  S.P = lm ? toPoints(lm, cv.width, cv.height, settings.swapSides) : null;
  S.metrics = S.P ? computeMetrics(S.P) : null;
  if (S.metrics && S.roll !== null) S.metrics.roll = Math.round(S.roll * 10) / 10;
  if (S.metrics && S.dist) S.metrics.dist = Math.round(S.dist * 100) / 100;
  S.results = S.evaluator ? S.evaluator.update(S.metrics, now) : [];
  drawOverlay(cv.getContext('2d'), S.P, S.metrics, step && ['work', 'check', 'prep'].includes(step.kind) ? S.results : [], OVERLAY_COLORS);

  // FPS
  S.fps.n++;
  if (now - S.fps.t > 5000) { S.fps.value = Math.round((S.fps.n * 1000) / (now - S.fps.t)); devLog('fps', { fps: S.fps.value }); S.fps = { n: 0, t: now, value: S.fps.value }; }
  if (S.dev && lm && now - S.lastLm > 2000) { S.lastLm = now; devLog('lm', { d: lm.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3), +(p.visibility ?? 1).toFixed(2)]), m: compactMetrics(S.metrics) }); }

  if (!step) return;
  updateHud(step, now);
  if (S.runner.paused) return;

  if (step.kind === 'prep' && step.waiting) {
    const up = S.metrics?.wristsAboveHead === 2 && S.runner.elapsedInStep(now) > 3;
    if (up) {
      S.raiseSince ??= now;
      const held = (now - S.raiseSince) / 1000;
      $('#raise-meter').textContent = held < 1 ? `${Math.round(held * 100)} %` : '✓';
      if (held >= 1) { S.runner.confirm('gesture'); $('#readybar').hidden = true; S.raiseSince = null; }
    } else { S.raiseSince = null; $('#raise-meter').textContent = ''; }
  }

  if (step.kind === 'work') {
    const st = S.items[step.idx];
    st.frames++;
    if (S.tracker) {
      S.tracker.update(S.metrics, now);
      if (now - (S.lastPhaseRender || 0) > 200) { S.lastPhaseRender = now; renderMotionPhases(S.tracker.motion); }
    }
    guide(step, now);
    if (S.metrics) { st.inFrame++; S.lastSeen = now; }
    const sc = frameScore(S.results);
    if (sc !== null) { st.scored++; st.scoreSum += sc; S.repPosture.n++; S.repPosture.sum += sc; }
    for (const r of S.results) if (r.status === 'bad') st.badFrames[r.id] = (st.badFrames[r.id] || 0) + 1;
    const cm = compactMetrics(S.metrics);
    if (cm) { st.mN++; for (const [k, val] of Object.entries(cm)) st.mSum[k] = (st.mSum[k] || 0) + val; }
    if (now - S.lastSample >= 1000) {
      S.lastSample = now;
      S.samples.push({ t_ms: Math.round(now - S.t0), exercise_id: step.item.id, rep: step.rep, side: step.side, score: sc === null ? null : Math.round(sc * 1000) / 1000, metrics: cm, bad: S.results.filter((r) => r.status === 'bad').map((r) => r.id) });
    }
    const cue = S.runner.postureFeedback(S.results, now);
    if (cue) {
      st.cues++;
      showCue(cue.cue);
      devLog('cue', { ex: step.item.id, check: cue.id, value: +cue.value?.toFixed(3), range: cue.range });
      snapshot('cue');
    }
    if (S.dev && !S.snappedSteps.has(S.runner.i) && S.runner.elapsedInStep(now) > step.duration / 2) { S.snappedSteps.add(S.runner.i); snapshot('rep_mid'); }
    // Person nicht im Bild
    if (now - S.lastSeen > 3000 && now - S.lastFrameWarn > 12000 && !S.speaker.busy) {
      S.lastFrameWarn = now; S.speaker.say('Ich sehe dich nicht. Bitte ganz ins Bild.');
      devLog('not_in_frame', {});
    }
  }
}

function updateHud(step, now) {
  const dd = estimateDistance(S.P, $('#overlay').width, $('#overlay').height);
  if (dd) S.dist = S.dist ? S.dist + 0.05 * (dd - S.dist) : dd;
  if (now - (S.lastFarScale || 0) > 1000) { S.lastFarScale = now; updateFarScale(); }
  renderFar(step, now);
  const active = step.kind === 'work' || step.kind === 'check';
  const rel = S.results.filter((r) => ['ok', 'warn', 'bad'].includes(r.status));
  const worst = rel.some((r) => r.status === 'bad') ? 'bad' : rel.some((r) => r.status === 'warn') ? 'warn' : rel.length ? 'ok' : '';
  $('#ring').className = `ring ${active ? worst : ''}`;
  const showChecks = ['work', 'check', 'rest', 'switch'].includes(step.kind);
  $('#checks').innerHTML = showChecks ? S.results.filter((r) => r.status !== 'idle').map((r) => `<span class="chk ${active ? r.status : ''}">${esc(r.label)}</span>`).join('') : '';
  if (step.kind === 'work' || step.kind === 'check') {
    $('#camstatus').textContent = !S.metrics && now - S.lastSeen > 2500 ? 'Bitte ganz ins Bild' : '';
  }
  if (step.kind === 'prep' || step.kind === 'check') {
    const vc = $('#prep-viewcheck');
    const m = S.metrics;
    if (!m) { vc.textContent = 'Noch niemand im Bild.'; vc.className = 'viewcheck bad'; }
    else {
      const frontal = m._frontal > 0.4;
      const ok = S.expectView === 'front' ? frontal : m._frontal < 0.35;
      const tilted = S.roll !== null && S.upright && Math.abs(S.roll) > 3;
      vc.textContent = (ok ? (S.expectView === 'front' ? 'Kamera passt: frontal erkannt.' : 'Kamera passt: seitlich erkannt.') : (S.expectView === 'front' ? 'Dreh dich frontal zur Kamera.' : 'Kamera seitlich stellen bzw. seitlich zur Kamera drehen.'))
        + (tilted ? ` Handy steht ${Math.abs(Math.round(S.roll))}° schief – bitte gerade hinstellen, sonst messe ich Schulter und Becken schief.` : '');
      vc.className = `viewcheck ${ok && !tilted ? 'ok' : 'bad'}`;
    }
  }
}

// Kurze Korrekturen für die Fernansicht (2–3 Wörter): [zu hoch, zu niedrig]
const SHORT = {
  shouldersLevel: ['Linke Schulter tiefer', 'Rechte Schulter tiefer'],
  pelvisLevel: ['Becken links tiefer', 'Becken rechts tiefer'],
  trunkCentered: ['Oberkörper nach rechts', 'Oberkörper nach links'],
  headCentered: ['Kopf nach rechts', 'Kopf nach links'],
  armsSymmetric: ['Linker Ellbogen höher', 'Rechter Ellbogen höher'],
  wristsSymmetric: ['Linke Hand höher', 'Rechte Hand höher'],
  trunkUpright: ['Aufrichten', 'Nicht zurücklehnen'],
  earOverShoulder: ['Kinn zurück', null],
  backFlat: ['Rücken gerade', null],
  handsUnderShoulders: ['Hände unter Schultern', null],
  kneesUnderHips: ['Knie unter Hüfte', null],
  hipExtended: [null, 'Becken höher'],
  kneesSoft: ['Knie leicht beugen', 'Knie strecken'],
  armLevel: ['Arm tiefer', 'Arm höher'],
  legLevel: ['Bein tiefer', 'Bein höher'],
};
const shortPhase = (label) => label.split(/[,:–]/)[0].split(' ').slice(0, 3).join(' ');

// Abstand zur Kamera grob aus der Rumpflänge im Bild schätzen (Rumpf ≈ 0,5 m, Bildwinkel ≈ 60°)
function estimateDistance(P, vw, vh) {
  if (!P || P[11].v < 0.5 || P[23].v < 0.5) return null;
  const sx = (P[11].x + P[12].x) / 2, sy = (P[11].y + P[12].y) / 2, hx = (P[23].x + P[24].x) / 2, hy = (P[23].y + P[24].y) / 2;
  const f = Math.hypot(sx - hx, sy - hy) / Math.max(vw, vh);
  if (f < 0.02) return null;
  return Math.max(0.8, Math.min(4.5, 0.5 / (f * 1.155)));
}
function updateFarScale() {
  const mode = settings.farView || 'auto';
  const stage = $('#stage');
  stage.classList.toggle('farmode', mode !== 'off');
  if (mode === 'off') return;
  const pxPerMm = Math.min(window.innerWidth, window.innerHeight) / 68; // Handybreite ≈ 68 mm
  let d = mode === 'xl' ? 3.2 : mode === 'l' ? 2.4 : (S.dist ?? 2.3);
  const mm = Math.max(6, Math.min(14, d * 3.6)); // ~3,6 mm Zeichenhöhe pro Meter
  const px = Math.round(Math.min(mm * pxPerMm, Math.min(window.innerWidth, window.innerHeight * 1.1) / 10.5));
  if (px !== S.farPx) { S.farPx = px; stage.style.setProperty('--far', `${px}px`); }
}
function renderFar(step, now) {
  const far = $('#far');
  const active = ['work', 'rest', 'switch'].includes(step.kind) && (settings.farView || 'auto') !== 'off';
  far.hidden = !active; $('#far-bottom').hidden = !active;
  if (!active) return;
  const st = $('#far-status');
  let cls = 'info', txt = '';
  if (step.kind === 'work') {
    if (!S.metrics && now - S.lastSeen > 2000) { cls = 'warn'; txt = 'Ganz ins Bild'; }
    else if (S.feetMissing) { cls = 'warn'; txt = 'Füße ins Bild'; }
    else {
      const bad = S.results.filter((r) => r.status === 'bad').sort((a, b) => b.badFor - a.badFor)[0];
      const warn = S.results.find((r) => r.status === 'warn');
      const pick = bad || warn;
      const short = pick ? SHORT[pick.id]?.[pick.dir > 0 ? 0 : 1] : null;
      if (pick && short) { cls = bad ? 'bad' : 'warn'; txt = short; }
      else if (S.tracker && S.tracker.motion.kind === 'cycle') {
        const ph = S.tracker.motion.phases[S.tracker.seq];
        cls = 'info'; txt = shortPhase(ph.label);
      } else if (S.results.some((r) => r.status === 'ok')) { cls = 'ok'; txt = '✓ Gut so'; }
      else { cls = 'info'; txt = step.item.type === 'hold' ? 'Halten' : 'Weiter so'; }
    }
  } else {
    const last = S.items[step.idx]?.repResults.at(-1);
    if (last && last.score !== null) {
      cls = last.score >= 0.8 ? 'ok' : last.score >= 0.6 ? 'warn' : 'bad';
      const mot = MOTIONS[step.item.id];
      const miss = mot?.phases.find((p) => last.phases[p.id] === false);
      txt = `${Math.round(last.score * 100)} %` + (miss ? ` · ${shortPhase(miss.label)} fehlte` : '');
    } else { cls = 'info'; txt = step.kind === 'switch' ? 'Seitenwechsel' : 'Pause'; }
  }
  if (st.textContent !== txt) st.textContent = txt;
  if (st.className !== `far-status ${cls}`) st.className = `far-status ${cls}`;
}

// Ansagen während der Übung: Bewegungsablauf, Körperhaltung, was man spüren sollte
function guide(step, now) {
  if (settings.formVoice === false || S.runner.paused) return;
  const ex = byId[step.item.id], t = S.tracker, el = S.runner.elapsedInStep(now);
  const sp = S.speaker;
  S.guideFor ??= {};
  const g = (S.guideFor[step.item.id] ??= { stepIdx: 1, feelSaid: false, feetWarned: false, last: 0 });
  // Füße/Person nicht erkennbar → einmal pro Übung Hinweis
  if (t && el > 4 && !g.feetWarned && Object.values(t.measurable).every((v) => !v)) {
    g.feetWarned = true;
    const feet = S.P && (S.P[27].v < 0.4 || S.P[28].v < 0.4);
    S.feetMissing = feet;
    devLog('not_measurable', { ex: step.item.id, feet });
    sp.say(feet ? 'Ich sehe deine Füße nicht. Stell die Kamera etwas weiter weg oder tiefer, damit die Füße im Bild sind.' : 'Ich kann die Bewegung noch nicht erkennen. Bitte ganz ins Bild.');
    return;
  }
  if (t && Object.values(t.measurable).some(Boolean)) S.feetMissing = false;
  if (sp.busy || now - S.runner.lastCueAt < 3000 || el < 2.5) return;
  // Bewegungsübungen: in den ersten zwei Durchgängen jeden Teilschritt im Takt ansagen
  if (t && t.motion.kind === 'cycle' && t.seqChanged && t.cycles < 2) {
    sp.say(`${t.motion.phases[t.seq].label}.`);
    g.last = now; return;
  }
  // einmal pro Übung: was man spüren sollte (in der Mitte der ersten Wiederholung)
  if (!g.feelSaid && step.rep === 0 && step.side === 0 && el > step.duration * 0.45 && ex.feel) {
    g.feelSaid = true; sp.say(ex.feel); g.last = now; return;
  }
  // alle ~12 s ein Satz zur Ausführung (Arme, Beine, Haltung), reihum aus der Anleitung
  if (now - g.last > 12000 && step.duration - el > 5 && ex.steps.length) {
    sp.say(ex.steps[g.stepIdx % ex.steps.length]);
    g.stepIdx++; g.last = now;
  }
}

function finalizeRep(step, nextStep) {
  const it = S.items[step.idx];
  const mot = MOTIONS[step.item.id];
  const posture = S.repPosture.n ? S.repPosture.sum / S.repPosture.n : null;
  const r = S.tracker ? S.tracker.result(posture) : { phases: {}, phaseScore: null, postureScore: posture === null ? null : Math.round(posture * 1000) / 1000, score: posture === null ? null : Math.round(posture * 1000) / 1000 };
  const durMs = Math.round(Math.min(step.duration, S.lastWorkEl || 0) * 1000);
  if (durMs < 1500) return; // übersprungen
  const row = { exercise_id: step.item.id, exercise_idx: step.idx, rep: step.rep, side: step.side, started_ms: Math.round(S.repStart - S.t0), duration_ms: durMs, kind: mot?.kind || null, ...r };
  it.repResults.push(row); S.repRows.push(row);
  devLog('rep', row);
  renderRepDots(step.idx);
  // kurze Rückmeldung in der Pause
  if (nextStep && ['rest', 'switch'].includes(nextStep.kind) && mot) {
    const missing = mot.phases.find((p) => r.phases[p.id] === false);
    const msg = missing ? `${missing.label} hat noch gefehlt.` : r.score !== null && r.score >= 0.8 ? 'Sauber ausgeführt.' : null;
    if (msg) setTimeout(() => S?.speaker.say(msg), 60);
  }
  S.tracker = null;
}

function renderMotionPhases(mot) {
  const t = S.tracker, step = S.runner?.step;
  const working = step?.kind === 'work' && t;
  const last = !working && step?.idx !== undefined ? S.items[step.idx]?.repResults.at(-1) : null;
  $('#motion-phases').innerHTML = mot.phases.map((p, i) => {
    let cls = '';
    if (working) {
      if (t.reached[p.id]) cls = 'done';
      else if (mot.kind === 'cycle' ? t.seq === i : t.live[p.id] === false) cls = 'live';
      if (!t.measurable[p.id] && t.evalMs + (performance.now() - t.t0) > 4000) cls += ' na';
    } else if (last) {
      cls = last.phases[p.id] === true ? 'done' : last.phases[p.id] === false ? 'miss' : 'na';
    }
    return `<li class="${cls}">${esc(p.label)}</li>`;
  }).join('') + (working && mot.kind === 'cycle' ? `<li class="na">Durchgänge: ${t.cycles}${t.item ? ' / ~' + Math.max(1, Math.floor(t.item.hold / (mot.cycleSec || 4))) : ''}</li>` : '');
  const farHtml = mot.phases.map((p, i) => {
    let cls = '';
    if (working) { cls = t.reached[p.id] ? 'done' : (mot.kind === 'cycle' ? t.seq === i : t.live[p.id] === false) ? 'live' : ''; }
    else if (last) cls = last.phases[p.id] === true ? 'done' : last.phases[p.id] === false ? 'miss' : 'na';
    return `<div class="far-ph ${cls}"><b>${working && t.reached[p.id] ? '✓' : i + 1}</b><span>${esc(shortPhase(p.label))}</span></div>`;
  }).join('');
  const fp = $('#far-phases'); if (fp.innerHTML !== farHtml) fp.innerHTML = farHtml;
}

function renderRepDots(idx) {
  const it = S.items[idx]; if (!it) return;
  const total = it.reps * it.sides;
  const dots = Array.from({ length: total }, (_, i) => {
    const r = it.repResults[i];
    const c = !r || r.score === null ? '' : r.score >= 0.8 ? 'g' : r.score >= 0.6 ? 'y' : 'r';
    return `<i class="${c}" title="${r?.score != null ? Math.round(r.score * 100) + ' %' : ''}"></i>`;
  }).join('');
  $('#motion-reps').innerHTML = `<span>Wdh.</span>${dots}`;
  const cur = S.runner?.step;
  const curIdx = cur?.kind === 'work' && cur.idx === idx ? cur.side * it.reps + cur.rep : -1;
  $('#far-reps').innerHTML = Array.from({ length: total }, (_, i) => {
    const r = it.repResults[i];
    const c = !r || r.score === null ? (i === curIdx ? 'cur' : '') : r.score >= 0.8 ? 'g' : r.score >= 0.6 ? 'y' : 'r';
    return `<i class="${c}"></i>`;
  }).join('');
}

function showCue(text) {
  const c = $('#cue'); c.textContent = text; c.hidden = false;
  clearTimeout(showCue._t); showCue._t = setTimeout(() => { c.hidden = true; }, 3000);
}

function snapshot(reason) {
  if (!S?.dev || S.snapshots.length >= 40) return;
  const v = $('#video'), ov = $('#overlay');
  if (!v.videoWidth) return;
  const w = 480, h = Math.round((480 * v.videoHeight) / v.videoWidth);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(v, 0, 0, w, h); ctx.drawImage(ov, 0, 0, w, h);
  const step = S.runner?.step;
  S.snapshots.push({
    t_ms: Math.round(performance.now() - S.t0), exercise_id: step?.item?.id || step?.kind, reason,
    metrics: compactMetrics(S.metrics),
    checks: S.results.map((r) => ({ id: r.id, status: r.status, value: r.value === undefined ? null : Math.round(r.value * 1000) / 1000, lo: r.range ? Math.round(r.range.lo * 1000) / 1000 : null, hi: r.range ? Math.round(r.range.hi * 1000) / 1000 : null })),
    image: c.toDataURL('image/jpeg', 0.6),
  });
}

$('#b-ready').addEventListener('click', () => { if (S?.runner?.confirm('tap')) $('#readybar').hidden = true; });

$('#c-pause').addEventListener('click', () => {
  if (!S?.runner) return;
  if (S.runner.paused) { S.runner.resume(); $('#c-pause').textContent = 'Pause'; } else { S.runner.pause(); $('#c-pause').textContent = 'Weiter'; }
});
$('#c-more').addEventListener('click', () => S?.runner?.extendRest(10));
$('#c-skip').addEventListener('click', () => {
  if (!S?.runner) return;
  const st = S.runner.step;
  if (st?.idx !== undefined) S.items[st.idx].skippedByUser = true;
  S.runner.skipExercise();
});
$('#c-mute').addEventListener('click', () => {
  settings.mute = !settings.mute; S.speaker.settings.mute = settings.mute;
  if (settings.mute) S.speaker.stop();
  $('#c-mute').textContent = settings.mute ? 'Ton an' : 'Ton aus';
});
$('#c-flag').addEventListener('click', () => {
  if (!S) return;
  const st = S.runner?.step;
  S.dev.notes.flags.push({ t: Math.round(performance.now() - S.t0), ex: st?.item?.id, kind: st?.kind, results: S.results.map((r) => [r.id, r.status, r.value === undefined ? null : +r.value.toFixed(3)]) });
  if (st?.idx !== undefined) S.items[st.idx].flags++;
  snapshot('flag');
  toast('Markiert: Erkennung falsch');
});
$('#c-end').addEventListener('click', () => { $('#end-confirm').hidden = false; });
$('#c-end-no').addEventListener('click', () => { $('#end-confirm').hidden = true; });
$('#c-end-yes').addEventListener('click', () => { $('#end-confirm').hidden = true; finishSession(false); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S?.runner && !S.runner.paused) { S.runner.pause(); $('#c-pause').textContent = 'Weiter'; devLog('hidden_pause', {}); }
});

function finishSession(completed) {
  if (!S || S.finished) return;
  S.finished = true;
  const step = S.runner?.step;
  if (step?.kind === 'work') { S.items[step.idx].workSec += Math.min(step.duration, S.lastWorkEl || 0); finalizeRep(step, null); }
  if (step?.kind === 'check') finishPostureCheck();
  S.runner?.stop();
  S.stopPrepAnim?.(); S.stopMiniAnim?.(); S.miniFor = null;
  if (completed) S.speaker.say('Geschafft. Gut gemacht!');
  cancelAnimationFrame(S.raf);
  S.stream?.getTracks().forEach((t) => t.stop());
  S.wake?.release?.().catch(() => {});
  window.onerror = null;
  S.endedAt = new Date();
  S.completed = completed;
  devLog('speech_stats', S.speaker.stats());
  if (S.speaker.switchedToCompat) settings.speechCompat = true;

  const exercises = S.items.map((it) => {
    const planned = it.reps * it.hold * it.sides;
    const postureScore = it.scored ? Math.round((it.scoreSum / it.scored) * 1000) / 1000 : null;
    const rs = it.repResults.map((r) => r.score).filter((v) => v !== null);
    const score = rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 1000) / 1000 : postureScore;
    const ps = it.repResults.map((r) => r.phaseScore).filter((v) => v !== null);
    const phaseScore = ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 1000) / 1000 : null;
    const badRatio = {};
    for (const [k, n] of Object.entries(it.badFrames)) badRatio[k] = Math.round((n / Math.max(1, it.frames)) * 1000) / 1000;
    const mean = {};
    for (const [k, sum] of Object.entries(it.mSum)) mean[k] = Math.round((sum / it.mN) * 100) / 100;
    return {
      id: it.id, name: it.name, cat: it.cat, view: it.view, pos: it.pos, type: it.type,
      reps: it.reps, hold: it.hold, rest: it.rest, sides: it.sides,
      workSec: Math.round(it.workSec), plannedWorkSec: planned,
      skipped: it.workSec < planned * 0.5, skippedByUser: !!it.skippedByUser,
      score, postureScore, phaseScore, repResults: it.repResults.map(({ exercise_id, exercise_idx, ...r }) => r),
      inFrame: it.frames ? Math.round((it.inFrame / it.frames) * 1000) / 1000 : null,
      checks: byId[it.id].checks, cues: it.cues, badRatio, mean, flags: it.flags,
    };
  });
  const allReps = S.repRows.map((r) => r.score).filter((v) => v !== null);
  const scored = S.items.filter((i) => i.scored);
  const totalScored = scored.reduce((s, i) => s + i.scored, 0);
  const postureAvg = totalScored ? Math.round((scored.reduce((s, i) => s + i.scoreSum, 0) / totalScored) * 1000) / 1000 : null;
  S.summary = {
    durationSec: Math.round((S.endedAt - S.startedAt) / 1000),
    plannedSec: S.plan.seconds,
    exercisesDone: exercises.filter((e) => !e.skipped).length,
    exercisesPlanned: exercises.length,
    avgScore: allReps.length ? Math.round((allReps.reduce((a, b) => a + b, 0) / allReps.length) * 1000) / 1000 : postureAvg,
    postureScore: postureAvg,
    repsTotal: S.repRows.length,
    repsGood: S.repRows.filter((r) => r.score !== null && r.score >= 0.8).length,
    cues: exercises.reduce((s, e) => s + e.cues, 0),
    flags: exercises.reduce((s, e) => s + e.flags, 0),
    fps: S.fps.value,
    personJumps: S.personJumps || 0,
  };
  S.exercises = exercises;
  showCheckout();
}

function musclesOf(exs) {
  const out = {};
  for (const e of exs) {
    const m = byId[e.id]?.muscles || [];
    const w = m.map((_, i) => (i === 0 ? 1 : 0.5)), ws = w.reduce((a, b) => a + b, 0) || 1;
    m.forEach((g, i) => { out[g] = Math.round(((out[g] || 0) + (e.workSec * w[i]) / ws) * 10) / 10; });
  }
  return out;
}

function showCheckout() {
  const sm = S.summary;
  $('#co-title').textContent = S.completed ? 'Gut gemacht.' : 'Training beendet.';
  $('#co-summary').innerHTML = `
    <div class="kpi"><span class="klabel">Dauer</span><span class="kval">${fmtMin(sm.durationSec)}</span></div>
    <div class="kpi"><span class="klabel">Übungen</span><span class="kval">${sm.exercisesDone}/${sm.exercisesPlanned}</span></div>
    <div class="kpi"><span class="klabel">Haltung</span><span class="kval">${sm.avgScore === null ? '–' : Math.round(sm.avgScore * 100) + ' %'}</span></div>`;
  $('#co-note').value = '';
  $('#co-note-l').textContent = S.devMode ? 'Hinweise zur Haltungserkennung (für Claude)' : 'Notiz (optional)';
  setMsg('#co-msg', '');
  $('#b-co-save').disabled = false;
  show('checkout');
}

$('#b-co-save').addEventListener('click', async () => {
  if (!S) return;
  $('#b-co-save').disabled = true;
  const rating = document.querySelector('input[name="co-rate"]:checked')?.value || 'passend';
  const note = $('#co-note').value.trim();
  const checkout = { rating, note };
  if (S.dev) S.dev.notes.text = note;
  // Intensität anpassen
  if (rating === 'leicht') settings.intensity = Math.min(1.5, Math.round(settings.intensity * 1.1 * 100) / 100);
  if (rating === 'schwer') settings.intensity = Math.max(0.7, Math.round(settings.intensity * 0.9 * 100) / 100);
  const { calib, ...settingsSnap } = settings;
  const session = {
    id: S.id, schema_version: SCHEMA_VERSION,
    started_at: S.startedAt.toISOString(), ended_at: S.endedAt.toISOString(),
    mode: typeof S.plan.mode === 'number' ? S.plan.mode : null, variant: S.plan.variantName, completed: S.completed, dev_mode: S.devMode,
    device: { ua: navigator.userAgent, fps: S.fps.value, model: settings.model, camera: settings.camera, cameraOk: !!S.stream, speech: S.speaker.stats(), devcheck: ui.devcheck || null },
    settings_snapshot: { ...settingsSnap, calib },
    plan: { date: S.plan.date, variant: S.plan.variant, reroll: S.plan.reroll, seconds: S.plan.seconds, items: S.plan.items },
    exercises: S.exercises, posture_check: S.postureCheck || null,
    checkin: null, checkout, summary: { ...S.summary, muscles: musclesOf(S.exercises) },
  };
  const record = { session, samples: S.samples, dev: S.dev, snapshots: S.snapshots, reps: S.repRows };
  setMsg('#co-msg', 'Wird gespeichert …');
  try {
    const r = await store.saveRecord(record);
    await store.saveSettings(settings).catch(() => {});
    S = null; ui.customPlan = null; ui.picked = [];
    hist = await store.history();
    renderHome();
    show('home');
    toast(r.cloud ? 'Gespeichert.' : store.local ? 'Lokal gespeichert.' : 'Offline gespeichert, wird später hochgeladen.');
  } catch (e) {
    setMsg('#co-msg', `Hochladen fehlgeschlagen (${e.message}). Die Einheit ist auf dem Gerät gespeichert und wird beim nächsten Start hochgeladen.`, true);
    S = null;
    setTimeout(() => { renderHome(); show('home'); }, 4000);
  }
});

// ── Einstellungen ───────────────────────────────────────
let saveT = null;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => store.saveSettings(settings).then(() => {}, (e) => toast(`Einstellungen nicht gespeichert: ${e.message}`)), 500);
}

function renderSettings() {
  $('#equip').innerHTML = EQUIPMENT.map((e) => `<label class="chip"><input type="checkbox" id="eq-${e.id}" value="${e.id}" ${settings.equipment.includes(e.id) ? 'checked' : ''}><span>${esc(e.label)}</span></label>`).join('');
  $$('#equip input').forEach((i) => i.addEventListener('change', () => {
    settings.equipment = $$('#equip input:checked').map((x) => x.value); persist();
  }));
  $('#s-tol').value = settings.tolerance; $('#s-ref').value = settings.reference;
  $('#s-goal').value = Math.round(settings.correctionGoal * 100); $('#s-goal-o').textContent = `${$('#s-goal').value} %`;
  $('#s-check').checked = settings.postureCheck !== false; $('#s-confirm').checked = settings.confirmEach !== false; $('#s-swap').checked = !!settings.swapSides;
  $('#s-rate').value = settings.speechRate; $('#s-rate-o').textContent = String(settings.speechRate).replace('.', ',');
  $('#s-pvoice').checked = settings.postureVoice !== false; $('#s-camvoice').checked = settings.speakCamera !== false; $('#s-formvoice').checked = settings.formVoice !== false;
  $('#s-far').value = settings.farView || 'auto';
  $('#s-cam').value = settings.camera; $('#s-model').value = settings.model; $('#s-floor').checked = settings.floorAtNoon !== false;
  $('#s-int').value = settings.intensity; $('#s-int-o').textContent = `${Math.round(settings.intensity * 100)} %`;
  renderCalib();
  fillVoices();
  $('#s-engine').value = settings.voiceEngine || 'system';
  neural.isInstalled().then((ok) => {
    $('#b-neural-install').hidden = ok; $('#b-neural-remove').hidden = !ok;
    $('#neural-st').textContent = ok ? 'Eingebaute Stimme ist auf diesem Gerät gespeichert.' : 'Nutze die eingebaute Stimme, wenn die Sprachausgabe des Handys stumm bleibt.';
  });
  $('#claude-card').hidden = !store.cloud;
  $('#acct-info').textContent = store.local ? 'Testmodus: Daten liegen nur in diesem Browser.' : store.user ? `Angemeldet als ${store.user.email}. ${store.queueLength ? store.queueLength + ' Einheit(en) warten auf Upload.' : 'Alles synchronisiert.'}` : '';
  $('#b-logout').textContent = store.local ? 'Cloud verbinden' : 'Abmelden';
}

function renderCalib() {
  const c = settings.calib;
  const el = $('#calib-info');
  if (!c) { el.innerHTML = '<span>Noch keine Kalibrierung. Sie entsteht automatisch beim nächsten Haltungs-Check.</span>'; return; }
  const f = (v, d = 1) => (v === null || v === undefined ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('de-DE'));
  el.innerHTML = `<span>Kalibriert am ${new Date(c.at).toLocaleDateString('de-DE')}: Schultern ${f(c.shoulderTilt)}°, Becken ${f(c.hipTilt)}°, Rumpfverschiebung ${f(c.trunkShift * 100, 0)} % der Schulterbreite.</span>
    <button class="btn small ghost" id="b-recal" type="button">Beim nächsten Check neu kalibrieren</button>`;
  $('#b-recal').addEventListener('click', () => { settings.calib = null; persist(); renderCalib(); toast('Wird beim nächsten Haltungs-Check neu gemessen.'); });
}

function fillVoices() {
  const sel = $('#s-voice');
  const voices = ('speechSynthesis' in window ? speechSynthesis.getVoices() : []).filter((v) => v.lang?.toLowerCase().startsWith('de'));
  sel.innerHTML = `<option value="">Automatisch</option>${voices.map((v) => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}`;
  sel.value = settings.voiceName || '';
}
if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', fillVoices);

const bind = (id, fn, ev = 'change') => $(id).addEventListener(ev, fn);
bind('#s-tol', (e) => { settings.tolerance = e.target.value; persist(); });
bind('#s-ref', (e) => { settings.reference = e.target.value; persist(); });
bind('#s-goal', (e) => { settings.correctionGoal = +e.target.value / 100; $('#s-goal-o').textContent = `${e.target.value} %`; persist(); }, 'input');
bind('#s-check', (e) => { settings.postureCheck = e.target.checked; persist(); });
bind('#s-confirm', (e) => { settings.confirmEach = e.target.checked; persist(); });
bind('#s-swap', (e) => { settings.swapSides = e.target.checked; persist(); });
bind('#s-voice', (e) => { settings.voiceName = e.target.value; persist(); });
bind('#s-engine', async (e) => {
  if (e.target.value === 'neural' && !(await neural.isInstalled())) {
    e.target.value = settings.voiceEngine || 'system';
    await installNeural($('#neural-st'), $('#b-neural-install'));
    return;
  }
  settings.voiceEngine = e.target.value; persist();
});
bind('#b-neural-install', () => installNeural($('#neural-st'), $('#b-neural-install')), 'click');
bind('#b-neural-remove', async () => { await neural.uninstall(); settings.voiceEngine = 'system'; persist(); renderSettings(); toast('Eingebaute Stimme gelöscht.'); }, 'click');
bind('#s-rate', (e) => { settings.speechRate = +e.target.value; $('#s-rate-o').textContent = e.target.value.replace('.', ','); persist(); }, 'input');
bind('#s-pvoice', (e) => { settings.postureVoice = e.target.checked; persist(); });
bind('#s-camvoice', (e) => { settings.speakCamera = e.target.checked; persist(); });
bind('#s-formvoice', (e) => { settings.formVoice = e.target.checked; persist(); });
bind('#s-cam', (e) => { settings.camera = e.target.value; persist(); });
bind('#s-far', (e) => { settings.farView = e.target.value; persist(); });
bind('#s-model', (e) => { settings.model = e.target.value; persist(); });
bind('#s-floor', (e) => { settings.floorAtNoon = e.target.checked; persist(); });
bind('#s-int', (e) => { settings.intensity = +e.target.value; $('#s-int-o').textContent = `${Math.round(settings.intensity * 100)} %`; persist(); }, 'input');
bind('#b-voicetest', () => { const sp = new Speaker({ ...settings, mute: false }); sp.unlock(); sp.say('Schultern nach hinten unten. Noch zehn Sekunden.'); }, 'click');

bind('#b-share', async () => {
  try {
    const s = await store.createDevShare(7);
    const txt = `RÜCKEN-COACH DEV-ZUGANG\nurl: ${store.cfg.url}\nkey: ${store.cfg.key}\ntoken: ${s.token}\ngültig bis: ${new Date(s.expires_at).toLocaleString('de-DE')}`;
    const out = $('#share-out'); out.value = txt; out.hidden = false; $('#b-share-copy').hidden = false;
  } catch (e) { toast(`Fehler: ${e.message}`); }
}, 'click');
bind('#b-share-copy', async () => {
  const out = $('#share-out');
  try { await navigator.clipboard.writeText(out.value); toast('Kopiert. Füge es im Chat mit Claude ein.'); } catch { out.select(); }
}, 'click');
bind('#b-unshare', async () => { try { await store.revokeDevShares(); $('#share-out').hidden = true; $('#b-share-copy').hidden = true; toast('Alle Schlüssel widerrufen.'); } catch (e) { toast(`Fehler: ${e.message}`); } }, 'click');
bind('#b-sync', async () => { const n = await store.flushQueue(); hist = await store.history(); renderSettings(); toast(n ? `${n} Einheit(en) hochgeladen.` : 'Nichts offen.'); }, 'click');
bind('#b-logout', async () => {
  if (store.local) { store.resetConfig(); show('setup'); return; }
  await store.signOut(); show('auth');
}, 'click');
bind('#b-export', async () => {
  try {
    const data = await store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ruecken-coach-${dkey(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { toast(`Export fehlgeschlagen: ${e.message}`); }
}, 'click');

document.addEventListener('click', (e) => { if (!e.target.closest('[data-tip]')) $('#tooltip').hidden = true; });

boot();
