// Eingebaute Stimme: Piper-TTS läuft im Browser (WebAssembly), unabhängig von der Sprachausgabe des Handys.
// Das Sprachmodell (~60 MB) wird einmalig geladen und im Browser-Speicher (OPFS) abgelegt.
// Erzeugte Sätze werden zusätzlich im Cache gespeichert, damit sie beim nächsten Mal sofort da sind.

const LIB = 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/dist/piper-tts-web.js';
export const VOICE = 'de_DE-thorsten-medium';
export const VOICE_LABEL = 'Thorsten (eingebaut)';
const CACHE = `rc-tts-${VOICE}-v1`;

let libP = null;
function lib() {
  libP ||= import(LIB).catch((e) => { libP = null; throw e; });
  return libP;
}

export async function isInstalled() {
  try { return (await (await lib()).stored()).includes(VOICE); } catch { return false; }
}

// onProgress(fraction 0..1, text)
export async function install(onProgress = () => {}) {
  const l = await lib();
  const files = {};
  await l.download(VOICE, (p) => {
    if (p?.url) files[p.url] = { loaded: p.loaded || 0, total: p.total || 0 };
    const tot = Object.values(files).reduce((s, f) => s + f.total, 0);
    const got = Object.values(files).reduce((s, f) => s + f.loaded, 0);
    onProgress(tot ? got / tot : 0, `${Math.round(got / 1048576)} von ${Math.round(tot / 1048576) || '?'} MB`);
  });
  onProgress(1, 'fertig');
}

export async function uninstall() {
  try { await (await lib()).remove(VOICE); } catch { /* */ }
  try { await caches.delete(CACHE); } catch { /* */ }
}

function key(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return new URL(`__tts/${(h >>> 0).toString(36)}-${text.length}.wav`, location.href).href;
}

// Satz → WAV-Blob (aus Cache oder neu erzeugt)
export async function synthBlob(text) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch { /* Cache API nicht verfügbar */ }
  if (cache) {
    const hit = await cache.match(key(text));
    if (hit) return hit.blob();
  }
  const l = await lib();
  const blob = await l.predict({ text, voiceId: VOICE });
  if (cache) { try { await cache.put(key(text), new Response(blob, { headers: { 'Content-Type': 'audio/wav' } })); } catch { /* voll */ } }
  return blob;
}
