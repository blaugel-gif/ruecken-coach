// Rückfragemodus: Fragen per Sprache vor und während der Übung.
// Spracherkennung: Web Speech API (Chrome). Antworten: zuerst lokal (Zeit, Ausführung, Spüren, Haltung,
// Steuerbefehle), sonst – falls eingerichtet – über die Supabase-Funktion „coach-ask“ (Claude).

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const askSupported = !!SR;

const norm = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
const WAKE = /^(hey |hallo |ok |okay )?(coach|kotsch|kotch|couch|frage)\b/;

export class Listener {
  // mode: 'wake' (dauerhaft, mit Aktivierungswort) | 'push' (nur nach Knopf/Geste)
  constructor({ mode = 'wake', isBusy = () => false, onQuestion, onState = () => {}, log = () => {} }) {
    this.mode = mode; this.isBusy = isBusy; this.onQuestion = onQuestion; this.onState = onState; this.log = log;
    this.active = false; this.armedUntil = 0; this.rec = null; this.restarts = 0; this.lastStart = 0;
  }
  start() {
    if (!SR || this.active) return;
    this.active = true;
    if (this.mode === 'wake') this._run();
  }
  stop() { this.active = false; this.armedUntil = 0; try { this.rec?.abort(); } catch { /* */ } this.rec = null; this.onState('off'); }
  // Nächste Äußerung ohne Aktivierungswort annehmen (Knopf oder Geste)
  arm(ms = 7000) {
    if (!SR) return;
    this.armedUntil = performance.now() + ms;
    this.onState('listening');
    if (!this.rec) this._run();
  }
  get armed() { return performance.now() < this.armedUntil; }
  _run() {
    if (!this.active || this.rec) return;
    const rec = new SR();
    rec.lang = 'de-DE'; rec.continuous = this.mode === 'wake'; rec.interimResults = false; rec.maxAlternatives = 3;
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r.isFinal) continue;
        const alts = [...r].map((a) => a.transcript.trim()).filter(Boolean);
        this._handle(alts);
      }
    };
    rec.onerror = (e) => { this.log('ask_rec_error', { error: e.error }); if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.active = false; this.onState('denied'); } };
    rec.onend = () => {
      this.rec = null;
      const again = this.active && (this.mode === 'wake' || this.armed);
      if (again) { const wait = performance.now() - this.lastStart < 1500 ? 1500 : 150; setTimeout(() => this._run(), wait); }
      else if (!this.armed) this.onState(this.active ? 'idle' : 'off');
    };
    try { this.lastStart = performance.now(); rec.start(); this.rec = rec; this.onState(this.armed ? 'listening' : 'idle'); }
    catch (e) { this.log('ask_start_error', { e: String(e) }); this.rec = null; }
  }
  _handle(alts) {
    const text = alts[0] || '';
    const n = norm(text);
    const woke = WAKE.test(n);
    if (!woke && !this.armed) return; // Gespräch im Raum oder eigene Ansage: ignorieren
    if (!woke && this.isBusy()) return; // die App spricht gerade selbst
    let q = woke ? text.replace(/^\s*(hey|hallo|ok|okay)?\s*(coach|kotsch|kotch|couch|frage)[\s,:.!?-]*/i, '') : text;
    this.armedUntil = 0;
    if (!q.trim()) { this.arm(); this.onQuestion?.(null); return; } // nur „Coach“ gesagt → zuhören
    this.onState('thinking');
    this.onQuestion?.(q.trim(), alts);
  }
}

// ── Lokale Antworten ──
// ctx: { ex, step, left, nextName, results, tracker, motion, muscles, cameraText, paused }
export function localAnswer(question, ctx) {
  const n = norm(question);
  const has = (re) => re.test(n);
  const ex = ctx.ex;
  // Steuerbefehle
  if (has(/\b(bereit|los geht|fang an|starte?n?)\b/) && ctx.step?.kind === 'prep' && ctx.step.waiting) return { action: 'confirm', say: null, show: 'Okay, es geht los.' };
  if (has(/^(pause|stopp|stop|halt|warte)\b|mach (mal )?pause/)) return { action: 'pause', say: null, show: 'Pause' };
  if (has(/^(weiter|fortsetzen|mach weiter|geht weiter)\b/) && ctx.paused) return { action: 'resume', say: null, show: 'Weiter' };
  if (has(/ueberspring|naechste uebung bitte|uebung auslassen/)) return { action: 'skip', say: 'Okay, ich überspringe die Übung.' };
  if (has(/wiederhol|nochmal|noch mal|sag das nochmal/)) return { action: 'repeat', say: null };
  if (has(/schmerz|tut weh|weh tut|stechen|kribbel|taub/)) return { action: 'pause', say: 'Hör sofort auf, wenn es schmerzt, sticht, kribbelt oder taub wird. Ich halte an. Mach die Übung nur weiter, wenn es ganz ohne Schmerz geht, und sprich anhaltende Beschwerden mit deiner Physiotherapie ab.' };
  // Informationen
  if (has(/wie (lange|lang)|wie viel(e)? (zeit|sekunden)|wann (ist|bin).*(fertig|vorbei)|noch lange/)) {
    if (!ctx.step || ctx.left === null) return { say: 'Gerade läuft keine Zeit.' };
    const kind = { work: 'diese Wiederholung', rest: 'die Pause', switch: 'der Seitenwechsel', prep: 'die Vorbereitung', check: 'der Haltungs-Check' }[ctx.step.kind] || 'dieser Abschnitt';
    return { say: ctx.step.kind === 'prep' && ctx.step.waiting ? 'Ich warte, bis du bereit bist.' : `Noch ${ctx.left} Sekunden für ${kind}.` };
  }
  if (has(/wiederholung|durchgang|durchgaenge|wie oft|wie viele (noch|mal)/) && ctx.step?.item) {
    const it = ctx.step.item;
    const rep = (ctx.step.rep ?? 0) + 1;
    return { say: `Wiederholung ${rep} von ${it.reps}${it.sides > 1 ? `, Seite ${(ctx.step.side ?? 0) + 1} von 2` : ''}.` };
  }
  if (has(/spuer|muskel|wo (merk|sollte|soll)|was (arbeitet|wird (gedehnt|trainiert))|dehnung wo/) && ex) {
    return { say: `${ex.feel} Beteiligte Muskeln: ${ctx.muscles}.` };
  }
  if (has(/wie (geht|mache|mach|soll)|erklaer|anleitung|was (soll|muss) ich (tun|machen)|ablauf|richtige? ausfuehrung|arme|beine|fuesse|haende/) && ex) {
    return { say: ex.steps.join(' ') };
  }
  if (has(/haltung|mach(e)? ich (das|es) richtig|passt (das|es)|bin ich gerade|korrekt|stimmt (das|es)|gut so/)) {
    const bad = (ctx.results || []).filter((r) => r.status === 'bad' || r.status === 'warn').map((r) => r.cue).filter(Boolean);
    const miss = ctx.motion && ctx.tracker ? ctx.motion.phases.filter((p) => ctx.tracker.measurable[p.id] && !ctx.tracker.reached[p.id]).map((p) => p.label) : [];
    if (!ctx.results?.length && !miss.length) return { say: 'Bei dieser Übung kann ich die Haltung gerade nicht messen.' };
    if (!bad.length && !miss.length) return { say: 'Sieht gut aus. Weiter so.' };
    return { say: [bad.length ? `Korrektur: ${bad[0]}.` : '', miss.length ? `Noch nicht erreicht: ${miss.join(', ')}.` : ''].join(' ').trim() };
  }
  if (has(/kamera|handy|abstand|wo (stell|steh)/) && ex) return { say: ctx.cameraText };
  if (has(/was kommt|danach|naechste/)) return { say: ctx.nextName ? `Als Nächstes: ${ctx.nextName}.` : 'Danach ist das Training geschafft.' };
  if (has(/^(danke|super|ok|okay|alles klar)\b/)) return { say: 'Gern.' };
  return null;
}

// ── Antwort über Claude (Supabase Edge Function) ──
export async function remoteAnswer(client, question, context) {
  if (!client) throw new Error('offline');
  const { data, error } = await client.functions.invoke('coach-ask', { body: { question, context } });
  if (error) throw error;
  if (!data?.answer) throw new Error(data?.error || 'keine Antwort');
  return data.answer;
}
