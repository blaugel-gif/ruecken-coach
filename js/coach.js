// Sprachausgabe, Töne und Ablaufsteuerung einer Trainingseinheit
import { byId } from './exercises.js';
import { cameraText } from './camera-svg.js';

const NUM = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn'];
const num = (n) => NUM[n] ?? String(n);

// Robuste Sprachausgabe. Chrome auf Android verschluckt Ansagen, wenn speak() direkt nach cancel()
// aufgerufen wird, wenn die Stimmenliste noch nicht geladen ist oder wenn Utterance-Objekte vom
// Garbage Collector eingesammelt werden. Daher: eigene Warteschlange, Verzögerung nach cancel,
// Referenzen halten, resume() vor jedem speak, Diagnose über log().
export class Speaker {
  constructor(settings, log = () => {}) {
    this.settings = settings;
    this.log = log;
    this.voice = null;
    this.voicesCount = 0;
    this.deVoices = 0;
    this.lastSpoke = 0;
    this.ctx = null;
    this.alive = new Set();
    this.cancelledAt = 0;
    this.started = 0; this.errors = 0; this.lastError = null;
    this.supported = 'speechSynthesis' in window;
    this.pickVoice();
    if (this.supported) speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());
  }
  pickVoice() {
    if (!this.supported) return;
    const all = speechSynthesis.getVoices();
    const voices = all.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('de'));
    this.voicesCount = all.length; this.deVoices = voices.length;
    const pref = this.settings.voiceName && voices.find((v) => v.name === this.settings.voiceName);
    this.voice = pref || voices.find((v) => v.localService && /google/i.test(v.name)) || voices.find((v) => v.localService) || voices.find((v) => /premium|enhanced|neural|google/i.test(v.name)) || voices[0] || null;
  }
  // Wartet kurz, bis die Stimmen geladen sind (Android liefert sie verzögert)
  async ready(ms = 1500) {
    if (!this.supported) return;
    const t0 = performance.now();
    while (!speechSynthesis.getVoices().length && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100));
    this.pickVoice();
    this.log('speech_ready', { voices: this.voicesCount, de: this.deVoices, voice: this.voice?.name || null, local: this.voice?.localService ?? null });
  }
  unlock() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.resume?.();
    } catch { /* ohne Ton weiter */ }
    if (this.supported) {
      try {
        speechSynthesis.resume();
        // Kurze hörbare Ansage innerhalb der Nutzergeste schaltet die Sprachausgabe frei
        this._speak('Los geht’s.');
      } catch (e) { this.log('speech_unlock_error', { e: String(e) }); }
    }
  }
  get busy() { return this.supported && (speechSynthesis.speaking || speechSynthesis.pending); }
  _speak(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.voice?.lang || 'de-DE';
    if (this.voice) u.voice = this.voice;
    u.rate = this.settings.speechRate || 1.05;
    u.volume = 1;
    this.alive.add(u);
    u.onstart = () => { this.started++; };
    u.onend = () => { this.alive.delete(u); };
    u.onerror = (ev) => {
      this.alive.delete(u);
      if (ev.error === 'interrupted' || ev.error === 'canceled') return;
      this.errors++; this.lastError = ev.error;
      this.log('speech_error', { error: ev.error, text: text.slice(0, 40) });
    };
    if (speechSynthesis.paused) speechSynthesis.resume();
    speechSynthesis.speak(u);
    this.lastSpoke = performance.now();
  }
  say(text, { interrupt = false } = {}) {
    if (!text || this.settings.mute || !this.supported) return;
    if (interrupt && this.busy) {
      speechSynthesis.cancel();
      this.cancelledAt = performance.now();
    }
    const wait = Math.max(0, 180 - (performance.now() - this.cancelledAt));
    if (wait > 0) setTimeout(() => this._speak(text), wait); else this._speak(text);
  }
  stop() { if (this.supported) { speechSynthesis.cancel(); this.cancelledAt = performance.now(); } }
  stats() { return { supported: this.supported, voices: this.voicesCount, de: this.deVoices, voice: this.voice?.name || null, started: this.started, errors: this.errors, lastError: this.lastError }; }
  beep(freq = 880, ms = 120, vol = 0.18) {
    if (this.settings.mute || !this.ctx) return;
    try {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + ms / 1000);
      o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + ms / 1000 + 0.02);
    } catch { /* ignorieren */ }
  }
}

// Ablauf in Schritte zerlegen
export function buildTimeline(plan, opts) {
  const steps = [];
  if (opts.postureCheck) steps.push({ kind: 'check', duration: 12, label: 'Haltungs-Check' });
  plan.items.forEach((it, idx) => {
    steps.push({ kind: 'prep', duration: opts.prep, item: it, idx });
    for (let side = 0; side < it.sides; side++) {
      if (side > 0) steps.push({ kind: 'switch', duration: 5, item: it, idx, side });
      for (let rep = 0; rep < it.reps; rep++) {
        steps.push({ kind: 'work', duration: it.hold, item: it, idx, rep, side });
        if (rep < it.reps - 1 && it.rest > 0) steps.push({ kind: 'rest', duration: it.rest, item: it, idx, rep, side });
      }
    }
  });
  steps.push({ kind: 'done', duration: 0 });
  return steps;
}

function sideName(it, side) {
  if (it.sides < 2) return '';
  return side === 0 ? 'erste Seite' : 'zweite Seite';
}

export class SessionRunner {
  constructor({ plan, settings, speaker, onStep, onTick, onFinish, log }) {
    this.plan = plan;
    this.settings = settings;
    this.speaker = speaker;
    this.steps = buildTimeline(plan, { prep: settings.prep, postureCheck: settings.postureCheck !== false });
    this.i = -1;
    this.onStep = onStep; this.onTick = onTick; this.onFinish = onFinish; this.log = log || (() => {});
    this.paused = false;
    this.stepStart = 0; this.pausedAt = 0; this.pausedTotal = 0;
    this.spokenMarks = new Set();
    this.lastCueAt = 0; this.cueHistory = {};
    this.lastPraise = 0; this.hadCorrection = false;
    this.timer = null;
  }
  get step() { return this.steps[this.i]; }
  get totalSeconds() { return this.steps.reduce((s, x) => s + x.duration, 0); }
  elapsedInStep(now = performance.now()) { return (now - this.stepStart - this.pausedTotal) / 1000; }
  start() {
    this.startedAt = new Date();
    this.next();
    this.timer = setInterval(() => this.tick(), 100);
  }
  stop() { clearInterval(this.timer); this.speaker.stop(); }
  pause() { if (this.paused) return; this.paused = true; this.pausedAt = performance.now(); this.speaker.stop(); this.speaker.say('Pause. Tippe auf Weiter, wenn du bereit bist.'); this.log('pause', {}); }
  resume() { if (!this.paused) return; this.pausedTotal += performance.now() - this.pausedAt; this.paused = false; this.speaker.say('Weiter.'); this.log('resume', {}); }
  skipExercise() {
    const cur = this.step?.idx;
    this.log('skip_exercise', { idx: cur });
    let j = this.i + 1;
    while (j < this.steps.length && this.steps[j].idx === cur && this.steps[j].kind !== 'done') j++;
    this.i = j - 1;
    this.speaker.stop();
    this.next(true);
  }
  extendRest(sec = 10) { if (this.step && (this.step.kind === 'rest' || this.step.kind === 'prep')) { this.step.duration += sec; this.speaker.say(`${sec} Sekunden mehr.`); } }

  next(skipped = false) {
    this.i++;
    this.stepStart = performance.now(); this.pausedTotal = 0; this.spokenMarks = new Set();
    const s = this.step;
    if (!s) return;
    this.log('step', { i: this.i, kind: s.kind, ex: s.item?.id, rep: s.rep, side: s.side, skipped });
    this.onStep?.(s, this.i);
    this.announce(s);
    if (s.kind === 'done') { clearInterval(this.timer); this.onFinish?.(); }
  }

  announce(s) {
    const sp = this.speaker;
    const it = s.item;
    if (s.kind === 'check') {
      sp.say('Haltungs-Check. Stell dich frontal vor die Kamera, ganzer Körper im Bild, Arme locker hängen lassen. Gleich messe ich fünf Sekunden lang.', { interrupt: true });
    } else if (s.kind === 'prep') {
      const ex = byId[it.id];
      const total = this.plan.items.length;
      const what = it.type === 'hold' ? `je ${it.hold} Sekunden halten` : `je ${it.hold} Sekunden Bewegung`;
      const reps = it.reps === 1 ? (it.type === 'hold' ? 'Einmal' : 'Ein Durchgang') : `${num(it.reps)} ${it.type === 'hold' ? 'Wiederholungen' : 'Durchgänge'}`;
      const pause = it.reps > 1 && it.rest ? `, ${it.rest} Sekunden Pause dazwischen` : '';
      const side = it.sides > 1 ? ' pro Seite' : '';
      const nr = s.idx === 0 ? 'Erste Übung' : s.idx === total - 1 ? 'Letzte Übung' : `Übung ${num(s.idx + 1)} von ${num(total)}`;
      sp.say(`${nr}: ${ex.name}. ${reps}${side}, ${what}${pause}.`, { interrupt: true });
      if (this.settings.speakCamera !== false) sp.say(ex.view === 'front' ? `Kamera frontal, ${ex.cam.height}.` : `Kamera seitlich, ${ex.cam.height}.`);
      sp.say(ex.cue);
    } else if (s.kind === 'work') {
      sp.beep(1046, 180);
      const repTxt = it.reps > 1 ? `${num(s.rep + 1)} von ${num(it.reps)}. ` : '';
      const sideTxt = s.rep === 0 && it.sides > 1 ? `${sideName(it, s.side)}. ` : '';
      sp.say(`${sideTxt}${repTxt}${it.type === 'hold' ? 'Halten.' : 'Los.'}`, { interrupt: true });
    } else if (s.kind === 'rest') {
      sp.beep(660, 160);
      sp.say(`Lösen. ${s.duration} Sekunden Pause.`, { interrupt: true });
    } else if (s.kind === 'switch') {
      sp.say('Seitenwechsel.', { interrupt: true });
    } else if (s.kind === 'done') {
      sp.beep(784, 150); setTimeout(() => sp.beep(1046, 260), 180);
      sp.say('Geschafft. Gut gemacht!', { interrupt: true });
    }
  }

  tick() {
    if (this.paused || !this.step) return;
    const s = this.step;
    const el = this.elapsedInStep();
    const left = Math.ceil(s.duration - el);
    this.onTick?.(s, el, left);
    const mark = (k, fn) => { if (!this.spokenMarks.has(k)) { this.spokenMarks.add(k); fn(); } };
    if (s.kind === 'work' && s.duration >= 20 && left === 10) mark('10', () => { if (!this.speaker.busy) this.speaker.say('Noch zehn Sekunden.'); });
    if (s.kind === 'rest' && left === 3) {
      const nxt = this.steps[this.i + 1];
      if (nxt?.kind === 'prep') mark('next', () => this.speaker.say('Gleich geht es weiter.'));
    }
    if (left <= 3 && left >= 1 && (s.kind === 'prep' || s.kind === 'work' || s.kind === 'check' || s.kind === 'switch')) {
      mark('b' + left, () => this.speaker.beep(left === 1 ? 990 : 740, 90, 0.14));
    }
    if (s.kind === 'rest' && s.duration >= 8 && left === Math.floor(s.duration / 2) && this.steps[this.i + 1]?.kind === 'prep') {
      // nächste Übung ankündigen
      const nx = this.steps[this.i + 1].item;
      mark('nx', () => this.speaker.say(`Danach: ${byId[nx.id].name}.`));
    }
    if (el >= s.duration && s.kind !== 'done') this.next();
  }

  // Haltungsfeedback per Sprache (gedrosselt)
  postureFeedback(results, now = performance.now()) {
    const s = this.step;
    if (!s || this.paused || s.kind !== 'work' || this.settings.postureVoice === false) return null;
    if (this.elapsedInStep(now) < 1.5) return null;
    const bad = results.filter((r) => r.status === 'bad' && r.cue).sort((a, b) => b.badFor - a.badFor)[0];
    if (bad) {
      const gap = this.settings.cueGap || 4500;
      const sameGap = 9000;
      if (now - this.lastCueAt > gap && now - (this.cueHistory[bad.cue] || 0) > sameGap && !this.speaker.busy) {
        this.speaker.say(bad.cue);
        this.lastCueAt = now; this.cueHistory[bad.cue] = now; this.hadCorrection = true;
        return bad;
      }
    } else if (this.hadCorrection && results.length && results.every((r) => r.status === 'ok' || r.status === 'idle') && now - this.lastCueAt > 2500 && now - this.lastPraise > 15000 && !this.speaker.busy) {
      this.speaker.say('Gut so.');
      this.lastPraise = now; this.hadCorrection = false;
    }
    return null;
  }
}

export { cameraText };
