// Speicherung: Supabase (Login + Row Level Security) mit lokaler Warteschlange als Absicherung.

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  equipment: ['stuhl'],
  tolerance: 'normal',
  reference: 'kalibriert',
  correctionGoal: 0.3,
  calib: null,
  postureCheck: true,
  postureVoice: true,
  speakCamera: true,
  speechRate: 1.05,
  mute: false,
  intensity: 1,
  model: 'lite',
  swapSides: false,
  camera: 'user',
  floorAtNoon: true,
};

export class Store {
  constructor() {
    this.cfg = LS.get('rc_cfg', null); // { url, key } oder { local: true }
    this.client = null;
    this.user = null;
  }
  get configured() { return !!this.cfg; }
  get local() { return !!this.cfg?.local; }
  get cloud() { return !!this.client && !!this.user; }

  configure(cfg) { this.cfg = cfg; LS.set('rc_cfg', cfg); this.client = null; }
  resetConfig() { LS.del('rc_cfg'); this.cfg = null; this.client = null; this.user = null; }

  async init() {
    if (!this.cfg || this.cfg.local) return;
    if (!window.supabase) throw new Error('Supabase-Bibliothek nicht geladen (Internet prüfen).');
    this.client = window.supabase.createClient(this.cfg.url, this.cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await this.client.auth.getSession();
    this.user = data.session?.user || null;
    this.client.auth.onAuthStateChange((_e, session) => { this.user = session?.user || null; });
  }

  async signUp(email, password) {
    const { data, error } = await this.client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    this.user = data.session?.user || null;
    return data;
  }
  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user;
    return data;
  }
  async signOut() { await this.client?.auth.signOut(); this.user = null; }

  // ── Einstellungen ──
  async loadSettings() {
    let s = { ...DEFAULT_SETTINGS, ...LS.get('rc_settings', {}) };
    if (this.cloud) {
      const { data, error } = await this.client.from('profiles').select('settings').maybeSingle();
      if (!error && data?.settings) s = { ...DEFAULT_SETTINGS, ...data.settings };
    }
    LS.set('rc_settings', s);
    return s;
  }
  async saveSettings(s) {
    LS.set('rc_settings', s);
    if (this.cloud) {
      const { error } = await this.client.from('profiles').upsert({ user_id: this.user.id, settings: s, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
  }

  // ── Einheiten ──
  // record = { session, samples:[], dev:{env,events,notes}|null, snapshots:[] }
  async saveRecord(record) {
    // Lokale Kurzfassung für Dashboard/Offline immer speichern
    const hist = LS.get('rc_history', []);
    hist.unshift(record.session);
    LS.set('rc_history', hist.slice(0, 400));
    if (!this.cloud) {
      if (!this.local) this.enqueue(record);
      return { cloud: false };
    }
    try {
      await this.pushRecord(record);
      return { cloud: true };
    } catch (e) {
      this.enqueue(record);
      throw e;
    }
  }

  async pushRecord({ session, samples, dev, snapshots, reps }) {
    const c = this.client;
    let { error } = await c.from('sessions').upsert({ ...session, user_id: this.user.id });
    if (error) throw error;
    for (let i = 0; i < (samples || []).length; i += 500) {
      ({ error } = await c.from('posture_samples').insert(samples.slice(i, i + 500).map((r) => ({ ...r, session_id: session.id, user_id: this.user.id }))));
      if (error) throw error;
    }
    if (dev) {
      ({ error } = await c.from('dev_logs').upsert({ session_id: session.id, user_id: this.user.id, env: dev.env, events: dev.events, notes: dev.notes }));
      if (error) throw error;
    }
    if (reps?.length) {
      // Ergebnisse je Wiederholung (eigene Tabelle; fehlt sie noch, bleiben sie in sessions.exercises erhalten)
      const rows = reps.map((r) => ({ session_id: session.id, user_id: this.user.id, exercise_id: r.exercise_id, exercise_idx: r.exercise_idx, rep: r.rep, side: r.side, started_ms: r.started_ms, duration_ms: r.duration_ms, kind: r.kind, phases: r.phases, cycles: r.cycles, expected_cycles: r.expectedCycles, hold_ratio: r.holdRatio, reach_ms: r.reachMs, phase_score: r.phaseScore, posture_score: r.postureScore, score: r.score }));
      const { error: repErr } = await c.from('rep_results').insert(rows);
      if (repErr && !/rep_results|does not exist|schema cache/i.test(repErr.message)) throw repErr;
    }
    for (const snap of snapshots || []) {
      ({ error } = await c.from('dev_snapshots').insert({ ...snap, session_id: session.id, user_id: this.user.id }));
      if (error) throw error;
    }
  }

  enqueue(record) {
    const q = LS.get('rc_queue', []);
    // Bilder nur behalten, wenn Platz ist
    if (!LS.set('rc_queue', [...q, record])) {
      LS.set('rc_queue', [...q, { ...record, snapshots: [] }]);
    }
  }
  get queueLength() { return LS.get('rc_queue', []).length; }
  async flushQueue() {
    if (!this.cloud) return 0;
    const q = LS.get('rc_queue', []);
    const rest = [];
    let ok = 0;
    for (const r of q) {
      try { await this.pushRecord(r); ok++; } catch { rest.push(r); }
    }
    LS.set('rc_queue', rest);
    return ok;
  }

  async history(limit = 500) {
    if (this.cloud) {
      const { data, error } = await this.client.from('sessions')
        .select('id,started_at,ended_at,mode,variant,completed,dev_mode,exercises,posture_check,checkin,checkout,summary,schema_version')
        .order('started_at', { ascending: false }).limit(limit);
      if (!error && data) { LS.set('rc_history', data.slice(0, 400)); return data; }
    }
    return LS.get('rc_history', []);
  }

  async exportAll() {
    const out = { exported_at: new Date().toISOString(), schema_version: SCHEMA_VERSION };
    if (!this.cloud) { out.sessions = LS.get('rc_history', []); out.queue = LS.get('rc_queue', []); return out; }
    const c = this.client;
    const all = async (table, cols = '*') => {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await c.from(table).select(cols).range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return rows;
    };
    out.profile = (await c.from('profiles').select('*').maybeSingle()).data;
    out.sessions = await all('sessions');
    out.posture_samples = await all('posture_samples');
    out.dev_logs = await all('dev_logs');
    return out;
  }

  // Befristeter Lese-Schlüssel für Claude
  async createDevShare(days = 7) {
    const expires = new Date(Date.now() + days * 864e5).toISOString();
    const { data, error } = await this.client.from('dev_shares').insert({ user_id: this.user.id, expires_at: expires }).select('token,expires_at').single();
    if (error) throw error;
    return data;
  }
  async revokeDevShares() {
    const { error } = await this.client.from('dev_shares').delete().eq('user_id', this.user.id);
    if (error) throw error;
  }
}

export { LS };
