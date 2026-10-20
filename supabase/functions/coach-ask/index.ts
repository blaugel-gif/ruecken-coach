// Supabase Edge Function „coach-ask“: beantwortet Rückfragen während des Trainings mit Claude.
// Nur für eingeloggte Nutzer (JWT-Prüfung durch Supabase). Der Anthropic-API-Schlüssel liegt als Secret ANTHROPIC_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODEL = Deno.env.get("COACH_MODEL") ?? "claude-haiku-5-5";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `Du bist ein ruhiger, kompetenter Bewegungscoach in einer Rücken-Trainings-App für eine erwachsene Person mit starker Skoliose, die sich hüftsteif fühlt.
Die Person trainiert gerade und hört deine Antwort über Lautsprecher aus 2–3 m Entfernung.
Regeln:
- Antworte auf Deutsch, in höchstens drei kurzen, gesprochenen Sätzen. Keine Aufzählungszeichen, kein Markdown, keine Emojis.
- Beziehe dich auf die aktuelle Übung aus dem Kontext (Anleitung, was man spüren soll, Messwerte).
- Gib keine Diagnosen. Bei Schmerz, Stechen, Kribbeln, Taubheit oder Schwindel: sofort aufhören und ärztlich bzw. physiotherapeutisch abklären lassen.
- Empfiehl keine asymmetrischen skoliosespezifischen Korrekturen, ohne auf die Abstimmung mit der Physiotherapie hinzuweisen.
- Wenn du etwas nicht weißt, sag es kurz.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Der Antwortdienst ist noch nicht eingerichtet (Schlüssel fehlt)." }, 503);
  let body: { question?: string; context?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const question = String(body.question ?? "").slice(0, 500).trim();
  if (!question) return json({ error: "Frage fehlt" }, 400);
  const context = JSON.stringify(body.context ?? {}).slice(0, 6000);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 250, system: SYSTEM,
      messages: [{ role: "user", content: `Kontext der laufenden Übung (JSON):\n${context}\n\nFrage der trainierenden Person: ${question}` }],
    }),
  });
  if (!r.ok) return json({ error: `Antwortdienst-Fehler ${r.status}` }, 502);
  const data = await r.json();
  const answer = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join(" ").trim();
  return json({ answer: answer || "Dazu habe ich gerade keine Antwort." });
});
