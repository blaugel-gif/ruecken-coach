import { EQUIPMENT, byId } from './exercises.js?v=202610191042';
import { suggestions, MODES, defaultModeForHour } from './planner.js?v=202610191042';
import { cameraSetupSVG, cameraText } from './camera-svg.js?v=202610191042';
import { loadPoseModel, toPoints, computeMetrics, PostureEvaluator, frameScore, drawOverlay, compactMetrics, CHECKS } from './pose.js?v=202610191042';
import { Speaker, SessionRunner, scriptTexts } from './coach.js?v=202610191042';
import { Store, DEFAULT_SETTINGS, SCHEMA_VERSION } from './store.js?v=202610191042';
import { renderDashboard } from './dashboard.js?v=202610191042';
import * as neural from './neuralvoice.js?v=202610191042';

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
  const tabbed = ['home', 'dash', 'settings'].includes(view);
  $('#tabs').hidden = !tabbed;
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === view));
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
  ui.plans = suggestions({ mode: ui.mode, equipment: settings.equipment, date: dkey(now), recent: recentMap(), intensity: settings.intensity, reroll: ui.reroll, floorAtNoon: settings.floorAtNoon });
  $('#suggestions').innerHTML = ui.plans.map((p, i) => {
    const live = p.items.filter((it) => byId[it.id].checks.length).length;
    return `<button class="sug ${i === ui.variant ? 'on' : ''}" data-i="${i}" type="button" aria-pressed="${i === ui.variant}">
      <span class="sname">${esc(p.variantName)}</span><span class="stime">${fmtMin(p.seconds)}</span>
      <span class="slist">${p.items.map((it) => esc(it.name)).join(' · ')}</span>
      <span class="smeta"><span class="tag">${p.items.length} Übungen</span><span class="tag">${live} mit Live-Prüfung</span><span class="tag">${cameraMoves(p)}× Kamera umstellen</span></span>
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
$('#b-start').addEventListener('click', () => {
  $('#ci-stiff').value = 5; $('#ci-pain').value = 2; syncOut('ci-stiff'); syncOut('ci-pain');
  show('checkin');
});
$('#b-ci-back').addEventListener('click', () => { stopDc(); show('home'); });
function syncOut(id) { $(`#${id}-o`).textContent = $(`#${id}`).value; }
['ci-stiff', 'ci-pain', 'co-stiff', 'co-pain'].forEach((id) => $(`#${id}`).addEventListener('input', () => { syncOut(id); checkPainWarn(); }));

// ── Training ────────────────────────────────────────────
let S = null; // laufende Einheit

$('#b-ci-go').addEventListener('click', () => { stopDc(); startSession(); });

async function startSession() {
  const plan = ui.plans[ui.variant];
  const speaker = new Speaker(settings);
  speaker.unlock();
  const devMode = $('#dev-toggle').checked;
  S = {
    plan, speaker, devMode, t0: performance.now(), startedAt: new Date(),
    id: crypto.randomUUID(),
    checkin: { stiffness: +$('#ci-stiff').value, pain: +$('#ci-pain').value },
    items: plan.items.map((it) => ({ ...it, workSec: 0, frames: 0, inFrame: 0, scored: 0, scoreSum: 0, cues: 0, badFrames: {}, mSum: {}, mN: 0, flags: 0 })),
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
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: settings.camera, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
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
    devLog('camera', { settings: track.getSettings?.(), label: track.label });
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

function evalSettings(extra = {}) {
  return { tolerance: settings.tolerance, reference: settings.reference, correctionGoal: settings.correctionGoal, calib: settings.calib, ...extra };
}

function onStep(step) {
  // vorherigen Arbeitsschritt verbuchen
  const prev = S.prevStep;
  if (prev && prev.kind === 'work') S.items[prev.idx].workSec += Math.min(prev.duration, S.lastWorkEl || 0);
  if (prev && prev.kind === 'check') finishPostureCheck();
  S.prevStep = step; S.lastWorkEl = 0;

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
  $('#timer').textContent = Math.max(0, left);
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
  const lm = res?.landmarks?.[0];
  S.P = lm ? toPoints(lm, cv.width, cv.height, settings.swapSides) : null;
  S.metrics = S.P ? computeMetrics(S.P) : null;
  S.results = S.evaluator ? S.evaluator.update(S.metrics, now) : [];
  drawOverlay(cv.getContext('2d'), S.P, S.metrics, step && ['work', 'check', 'prep'].includes(step.kind) ? S.results : [], OVERLAY_COLORS);

  // FPS
  S.fps.n++;
  if (now - S.fps.t > 5000) { S.fps.value = Math.round((S.fps.n * 1000) / (now - S.fps.t)); devLog('fps', { fps: S.fps.value }); S.fps = { n: 0, t: now, value: S.fps.value }; }
  if (S.dev && lm && now - S.lastLm > 2000) { S.lastLm = now; devLog('lm', { d: lm.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3), +(p.visibility ?? 1).toFixed(2)]), m: compactMetrics(S.metrics) }); }

  if (!step) return;
  updateHud(step, now);
  if (S.runner.paused) return;

  if (step.kind === 'work') {
    const st = S.items[step.idx];
    st.frames++;
    if (S.metrics) { st.inFrame++; S.lastSeen = now; }
    const sc = frameScore(S.results);
    if (sc !== null) { st.scored++; st.scoreSum += sc; }
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
      vc.textContent = ok ? (S.expectView === 'front' ? 'Kamera passt: frontal erkannt.' : 'Kamera passt: seitlich erkannt.') : (S.expectView === 'front' ? 'Dreh dich frontal zur Kamera.' : 'Kamera seitlich stellen bzw. seitlich zur Kamera drehen.');
      vc.className = `viewcheck ${ok ? 'ok' : 'bad'}`;
    }
  }
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
  if (step?.kind === 'work') S.items[step.idx].workSec += Math.min(step.duration, S.lastWorkEl || 0);
  if (step?.kind === 'check') finishPostureCheck();
  S.runner?.stop();
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
    const score = it.scored ? Math.round((it.scoreSum / it.scored) * 1000) / 1000 : null;
    const badRatio = {};
    for (const [k, n] of Object.entries(it.badFrames)) badRatio[k] = Math.round((n / Math.max(1, it.frames)) * 1000) / 1000;
    const mean = {};
    for (const [k, sum] of Object.entries(it.mSum)) mean[k] = Math.round((sum / it.mN) * 100) / 100;
    return {
      id: it.id, name: it.name, cat: it.cat, view: it.view, pos: it.pos, type: it.type,
      reps: it.reps, hold: it.hold, rest: it.rest, sides: it.sides,
      workSec: Math.round(it.workSec), plannedWorkSec: planned,
      skipped: it.workSec < planned * 0.5, skippedByUser: !!it.skippedByUser,
      score, inFrame: it.frames ? Math.round((it.inFrame / it.frames) * 1000) / 1000 : null,
      checks: byId[it.id].checks, cues: it.cues, badRatio, mean, flags: it.flags,
    };
  });
  const scored = S.items.filter((i) => i.scored);
  const totalScored = scored.reduce((s, i) => s + i.scored, 0);
  S.summary = {
    durationSec: Math.round((S.endedAt - S.startedAt) / 1000),
    plannedSec: S.plan.seconds,
    exercisesDone: exercises.filter((e) => !e.skipped).length,
    exercisesPlanned: exercises.length,
    avgScore: totalScored ? Math.round((scored.reduce((s, i) => s + i.scoreSum, 0) / totalScored) * 1000) / 1000 : null,
    cues: exercises.reduce((s, e) => s + e.cues, 0),
    flags: exercises.reduce((s, e) => s + e.flags, 0),
    fps: S.fps.value,
  };
  S.exercises = exercises;
  showCheckout();
}

function showCheckout() {
  const sm = S.summary;
  $('#co-title').textContent = S.completed ? 'Gut gemacht.' : 'Training beendet.';
  $('#co-summary').innerHTML = `
    <div class="kpi"><span class="klabel">Dauer</span><span class="kval">${fmtMin(sm.durationSec)}</span></div>
    <div class="kpi"><span class="klabel">Übungen</span><span class="kval">${sm.exercisesDone}/${sm.exercisesPlanned}</span></div>
    <div class="kpi"><span class="klabel">Haltung</span><span class="kval">${sm.avgScore === null ? '–' : Math.round(sm.avgScore * 100) + ' %'}</span></div>`;
  $('#co-stiff').value = S.checkin.stiffness; $('#co-pain').value = S.checkin.pain;
  syncOut('co-stiff'); syncOut('co-pain');
  $('#co-note').value = '';
  $('#co-note-l').textContent = S.devMode ? 'Hinweise zur Haltungserkennung (für Claude)' : 'Notiz (optional)';
  $('#co-warn').hidden = true;
  setMsg('#co-msg', '');
  $('#b-co-save').disabled = false;
  show('checkout');
}

function checkPainWarn() {
  if (!S?.checkin) return;
  const w = $('#co-warn');
  const worse = +$('#co-pain').value >= S.checkin.pain + 2;
  w.hidden = !worse;
  w.className = 'notice warn';
  w.textContent = 'Der Schmerz ist stärker als vorher. Lass belastende Übungen beim nächsten Mal weg oder wähle „Zu schwer“. Hält das an, kläre es ärztlich oder mit deiner Physiotherapie ab.';
}

$('#b-co-save').addEventListener('click', async () => {
  if (!S) return;
  $('#b-co-save').disabled = true;
  const rating = document.querySelector('input[name="co-rate"]:checked')?.value || 'passend';
  const note = $('#co-note').value.trim();
  const checkout = { stiffness: +$('#co-stiff').value, pain: +$('#co-pain').value, rating, note };
  if (S.dev) S.dev.notes.text = note;
  // Intensität anpassen
  if (rating === 'leicht') settings.intensity = Math.min(1.5, Math.round(settings.intensity * 1.1 * 100) / 100);
  if (rating === 'schwer') settings.intensity = Math.max(0.7, Math.round(settings.intensity * 0.9 * 100) / 100);
  const { calib, ...settingsSnap } = settings;
  const session = {
    id: S.id, schema_version: SCHEMA_VERSION,
    started_at: S.startedAt.toISOString(), ended_at: S.endedAt.toISOString(),
    mode: S.plan.mode, variant: S.plan.variantName, completed: S.completed, dev_mode: S.devMode,
    device: { ua: navigator.userAgent, fps: S.fps.value, model: settings.model, camera: settings.camera, cameraOk: !!S.stream, speech: S.speaker.stats(), devcheck: ui.devcheck || null },
    settings_snapshot: { ...settingsSnap, calib },
    plan: { date: S.plan.date, variant: S.plan.variant, reroll: S.plan.reroll, seconds: S.plan.seconds, items: S.plan.items },
    exercises: S.exercises, posture_check: S.postureCheck || null,
    checkin: S.checkin, checkout, summary: S.summary,
  };
  const record = { session, samples: S.samples, dev: S.dev, snapshots: S.snapshots };
  setMsg('#co-msg', 'Wird gespeichert …');
  try {
    const r = await store.saveRecord(record);
    await store.saveSettings(settings).catch(() => {});
    S = null;
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
  $('#s-check').checked = settings.postureCheck !== false; $('#s-swap').checked = !!settings.swapSides;
  $('#s-rate').value = settings.speechRate; $('#s-rate-o').textContent = String(settings.speechRate).replace('.', ',');
  $('#s-pvoice').checked = settings.postureVoice !== false; $('#s-camvoice').checked = settings.speakCamera !== false;
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
bind('#s-cam', (e) => { settings.camera = e.target.value; persist(); });
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
