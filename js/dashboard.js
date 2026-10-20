// Dashboard: Kennzahlen und Verläufe aus den gespeicherten Einheiten
import { byId } from './exercises.js?v=202610200851';
import { CHECKS } from './pose.js?v=202610200851';
import { computeBalance, agoText, WINDOW_MIN } from './balance.js?v=202610200851';

const DAY = 864e5;
const dkey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const fmtDate = (d) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export function computeKpis(hist) {
  const now = Date.now();
  const sessions = hist.filter((s) => s.started_at).sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
  const week = sessions.filter((s) => now - new Date(s.started_at) < 7 * DAY);
  const weekMin = week.reduce((m, s) => m + (s.summary?.durationSec || 0), 0) / 60;
  // Serie: Tage in Folge mit mindestens einer Einheit (heute oder gestern beginnend)
  const days = new Set(sessions.map((s) => dkey(s.started_at)));
  let streak = 0;
  let d = new Date();
  if (!days.has(dkey(d))) d = new Date(now - DAY);
  while (days.has(dkey(d))) { streak++; d = new Date(d.getTime() - DAY); }
  const scored = sessions.filter((s) => typeof s.summary?.avgScore === 'number');
  const last7 = scored.slice(-7).map((s) => s.summary.avgScore);
  const prev7 = scored.slice(-14, -7).map((s) => s.summary.avgScore);
  const totalMin = sessions.reduce((m, s) => m + (s.summary?.durationSec || 0), 0) / 60;
  return {
    total: sessions.length, weekCount: week.length, weekMin, streak,
    score: avg(last7), scoreDelta: prev7.length ? avg(last7) - avg(prev7) : null,
    totalMin,
    sessions,
  };
}

// Liniendiagramm (SVG, gemeinsame y-Achse)
function lineChart({ series, yMin, yMax, yTicks, yFmt = (v) => v, height = 200, id }) {
  const W = 440, H = height, pl = 46, pr = 14, pt = 12, pb = 26;
  const allX = series.flatMap((s) => s.points.map((p) => p.x));
  if (!allX.length) return `<p class="empty">Noch keine Daten.</p>`;
  let xMin = Math.min(...allX), xMax = Math.max(...allX);
  if (xMax - xMin < DAY) { xMin -= DAY / 2; xMax += DAY / 2; }
  const sx = (x) => pl + ((x - xMin) / (xMax - xMin)) * (W - pl - pr);
  const sy = (y) => pt + (1 - (y - yMin) / (yMax - yMin)) * (H - pt - pb);
  const parts = [];
  for (const t of yTicks) {
    parts.push(`<line x1="${pl}" x2="${W - pr}" y1="${sy(t)}" y2="${sy(t)}" class="grid"/>`);
    parts.push(`<text x="${pl - 6}" y="${sy(t) + 4}" class="tick" text-anchor="end">${yFmt(t)}</text>`);
  }
  const nX = 3;
  for (let i = 0; i <= nX; i++) {
    const x = xMin + ((xMax - xMin) * i) / nX;
    parts.push(`<text x="${sx(x)}" y="${H - 6}" class="tick" text-anchor="${i === 0 ? 'start' : i === nX ? 'end' : 'middle'}">${fmtDate(x)}</text>`);
  }
  series.forEach((s, si) => {
    const pts = s.points.filter((p) => p.y !== null && p.y !== undefined);
    if (!pts.length) return;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" class="line s${si + 1}"/>`);
    pts.forEach((p, i) => {
      const last = i === pts.length - 1;
      parts.push(`<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="${last ? 5 : 3.5}" class="dot s${si + 1}"/>`);
      parts.push(`<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="12" class="hit" data-tip="${esc(`${s.name}: ${yFmt(p.y)} · ${p.label || fmtDate(p.x)}`)}"/>`);
    });
  });
  return `<div class="chartwrap"><svg viewBox="0 0 ${W} ${H}" class="chart" id="${id}" role="img">${parts.join('')}</svg></div>`;
}

function legend(series) {
  if (series.length < 2) return '';
  return `<div class="legend">${series.map((s, i) => `<span><i class="sw s${i + 1}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

function heatmap(sessions) {
  const weeks = 12, cell = 15, gap = 3;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7; // Mo=0
  const start = new Date(today.getTime() - ((weeks - 1) * 7 + dow) * DAY);
  const counts = {};
  for (const s of sessions) { const k = dkey(s.started_at); counts[k] = (counts[k] || 0) + 1; }
  const cells = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (w * 7 + d) * DAY);
      if (date > today) continue;
      const c = counts[dkey(date)] || 0;
      cells.push(`<rect x="${22 + w * (cell + gap)}" y="${d * (cell + gap)}" width="${cell}" height="${cell}" rx="3" class="hm l${Math.min(c, 3)}" data-tip="${date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}: ${c} Einheit${c === 1 ? '' : 'en'}"/>`);
    }
  }
  const labels = ['Mo', '', 'Mi', '', 'Fr', '', 'So'].map((t, i) => t ? `<text x="0" y="${i * (cell + gap) + 12}" class="tick">${t}</text>` : '').join('');
  const W = 22 + weeks * (cell + gap);
  return `<div class="chartwrap"><svg viewBox="0 0 ${W} ${7 * (cell + gap)}" class="heat" style="max-width:${W * 1.6}px">${labels}${cells.join('')}</svg></div>
  <div class="legend small"><span>weniger</span><i class="hmsw l0"></i><i class="hmsw l1"></i><i class="hmsw l2"></i><i class="hmsw l3"></i><span>mehr</span></div>`;
}

function exerciseTable(sessions) {
  const agg = {};
  for (const s of sessions) for (const e of s.exercises || []) {
    if (e.skipped) continue;
    const a = (agg[e.id] ||= { n: 0, scores: [], bad: {} });
    a.n++;
    if (typeof e.score === 'number') a.scores.push(e.score);
    for (const [k, v] of Object.entries(e.badRatio || {})) a.bad[k] = (a.bad[k] || 0) + v;
  }
  const rows = Object.entries(agg).sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  if (!rows.length) return '<p class="empty">Noch keine Übungen absolviert.</p>';
  return `<div class="tablewrap"><table class="extable"><thead><tr><th>Übung</th><th class="num">Anzahl</th><th class="num">Ø Haltung</th><th>Häufigste Korrektur</th></tr></thead><tbody>${rows.map(([id, a]) => {
    const top = Object.entries(a.bad).sort((x, y) => y[1] - x[1])[0];
    const sc = avg(a.scores);
    return `<tr><td>${esc(byId[id]?.name || id)}</td><td class="num">${a.n}</td><td class="num">${sc === null ? '–' : Math.round(sc * 100) + ' %'}</td><td>${top && top[1] / a.n > 0.05 ? esc(CHECKS[top[0]]?.label || top[0]) : '–'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

export function renderDashboard(el, hist) {
  const k = computeKpis(hist);
  const S = k.sessions.slice(-40);
  const pct = (v) => `${Math.round(v * 100)} %`;
  const delta = (v, unit, invert = false) => {
    if (v === null || Math.abs(v) < 0.005) return '';
    const good = invert ? v < 0 : v > 0;
    return `<span class="delta ${good ? 'up' : 'down'}">${v > 0 ? '+' : '−'}${Math.abs(unit === '%' ? Math.round(v * 100) : Math.round(v * 10) / 10)}${unit === '%' ? ' Pkt.' : ''}</span>`;
  };
  const scoreSeries = [{ name: 'Haltungsqualität', points: S.filter((s) => typeof s.summary?.avgScore === 'number').map((s) => ({ x: +new Date(s.started_at), y: s.summary.avgScore, label: `${fmtDate(s.started_at)}, ${s.mode} Min.` })) }];
  const bal = computeBalance(hist);
  const groups = Object.values(bal.groups).sort((x, y) => y.sec - x.sec);
  const gmax = Math.max(1, ...groups.map((g) => g.sec));
  const fairSec = bal.windowSec / groups.length;
  const muscleHtml = bal.windowSec ? `<div class="mbars">${groups.map((g) => `
      <div class="mbar ${g.need > 0.6 ? 'low' : ''}" data-tip="${esc(`${g.label}: ${Math.round(g.sec / 6) / 10} Min, zuletzt ${agoText(g.days)}`)}">
        <span class="mname">${esc(g.label)}</span>
        <span class="track"><span class="fill" style="width:${(g.sec / gmax) * 100}%"></span><span class="fair" style="left:${Math.min(100, (fairSec / gmax) * 100)}%"></span></span>
        <span class="mval">${(Math.round(g.sec / 6) / 10).toLocaleString('de-DE')} Min · ${agoText(g.days)}</span>
      </div>`).join('')}</div>` : '<p class="empty">Noch keine Daten.</p>';
  const pc = S.filter((s) => s.posture_check && typeof s.posture_check.shoulderTilt === 'number');
  const postureSeries = [
    { name: 'Schulterschiefstand', points: pc.map((s) => ({ x: +new Date(s.started_at), y: Math.abs(s.posture_check.shoulderTilt) })) },
    { name: 'Beckenschiefstand', points: pc.filter((s) => typeof s.posture_check.hipTilt === 'number').map((s) => ({ x: +new Date(s.started_at), y: Math.abs(s.posture_check.hipTilt) })) },
  ];
  const pMax = Math.max(6, ...postureSeries.flatMap((s) => s.points.map((p) => p.y))) ;
  const pTop = Math.ceil(pMax / 2) * 2;

  el.innerHTML = `
    <section class="kpis">
      <div class="kpi"><span class="klabel">Diese Woche</span><span class="kval">${k.weekCount}</span><span class="ksub">Einheiten · ${Math.round(k.weekMin)} Min.</span></div>
      <div class="kpi"><span class="klabel">Serie</span><span class="kval">${k.streak}</span><span class="ksub">Tag${k.streak === 1 ? '' : 'e'} in Folge</span></div>
      <div class="kpi"><span class="klabel">Ø Haltung</span><span class="kval">${k.score === null ? '–' : pct(k.score)}</span><span class="ksub">letzte 7 Einheiten ${delta(k.scoreDelta, '%')}</span></div>
      <div class="kpi"><span class="klabel">Trainingszeit</span><span class="kval">${Math.round(k.totalMin)}</span><span class="ksub">Minuten insgesamt</span></div>
    </section>
    <section class="card">
      <h3>Haltungsqualität je Einheit</h3>
      <p class="hint">Anteil der Übungszeit, in der alle Live-Prüfungen im Zielbereich lagen.</p>
      ${lineChart({ series: scoreSeries, yMin: 0, yMax: 1, yTicks: [0, 0.25, 0.5, 0.75, 1], yFmt: pct, id: 'c_score' })}
    </section>
    <section class="card">
      <h3>Muskelgruppen, letzte ${WINDOW_MIN} Minuten Training</h3>
      <p class="hint">Übungszeit je Muskelgruppe (Hauptgruppe voll, Nebengruppen halb gezählt). Der Strich zeigt einen gleichmäßigen Anteil; fett = lange nicht dran.</p>
      ${muscleHtml}
    </section>
    <section class="card">
      <h3>Ausgangshaltung im Haltungs-Check</h3>
      <p class="hint">Gemessener Schiefstand in Grad beim ruhigen Stehen zu Beginn. Bei Skoliose zählt der Trend, nicht die Null.</p>
      ${legend(postureSeries)}
      ${lineChart({ series: postureSeries, yMin: 0, yMax: pTop, yTicks: Array.from({ length: pTop / 2 + 1 }, (_, i) => i * 2), yFmt: (v) => `${Math.round(v * 10) / 10}°`, id: 'c_posture' })}
    </section>
    <section class="card">
      <h3>Trainingstage</h3>
      ${heatmap(k.sessions)}
    </section>
    <section class="card">
      <h3>Übungen</h3>
      ${exerciseTable(k.sessions)}
    </section>`;

  // Tooltip
  const tip = document.getElementById('tooltip');
  el.querySelectorAll('[data-tip]').forEach((n) => {
    const show = (ev) => {
      tip.textContent = n.getAttribute('data-tip');
      tip.hidden = false;
      const r = n.getBoundingClientRect();
      tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
      tip.style.top = `${r.top + window.scrollY - tip.offsetHeight - 8}px`;
      ev.stopPropagation();
    };
    n.addEventListener('pointerenter', show);
    n.addEventListener('click', show);
    n.addEventListener('pointerleave', () => { tip.hidden = true; });
  });
  return k;
}
