// Zeichnet die Kameraposition relativ zur Übung: Draufsicht + Seitenansicht (Höhe)

const UPRIGHT = new Set(['stand', 'sit', 'kneel', 'floorsit']);

const HEIGHTS = {
  'Boden': 140, 'Boden bis Kniehöhe': 130, 'Sitzhöhe': 108, 'Hüfthöhe': 100,
  'Brusthöhe sitzend': 86, 'Kopfhöhe sitzend': 72, 'Brusthöhe': 70,
};

// Strichfiguren (Seitenansicht, Blick nach rechts). l = Linien, h = Kopf [x,y]
const FIGS = {
  stand: { h: [232, 50], l: [[232, 58, 232, 100], [232, 100, 226, 150], [232, 100, 240, 150], [232, 66, 226, 96], [232, 66, 240, 96]] },
  sit: {
    h: [232, 66], l: [[232, 74, 232, 116], [232, 116, 258, 116], [258, 116, 258, 150], [232, 82, 248, 106]],
    props: [[222, 118, 250, 118], [222, 118, 222, 150], [248, 118, 248, 150], [222, 118, 222, 84]],
  },
  kneel: { h: [232, 68], l: [[232, 76, 232, 112], [232, 112, 220, 148], [220, 148, 198, 148], [232, 112, 258, 112], [258, 112, 258, 150], [232, 84, 246, 106]] },
  quad: { h: [270, 106], l: [[212, 110, 260, 110], [256, 110, 256, 150], [212, 110, 210, 148], [210, 148, 186, 148]] },
  supine: { h: [190, 138], l: [[198, 141, 246, 141], [246, 141, 264, 118], [264, 118, 282, 147], [205, 141, 225, 146]] },
  prone: { h: [190, 140], l: [[198, 143, 250, 144], [250, 144, 286, 147], [198, 143, 182, 138]] },
  floorsit: { h: [222, 92], l: [[222, 100, 222, 140], [222, 140, 252, 128], [252, 128, 276, 146], [222, 108, 240, 128]] },
};

function line(x1, y1, x2, y2, cls = 'fig') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
}

function phone(x, y, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-6" y="-10" width="12" height="20" rx="2.5" class="phone"/><circle cx="0" cy="-6.5" r="1.4" class="lens"/></g>`;
}

export function cameraSetupSVG(ex) {
  const upright = UPRIGHT.has(ex.pos);
  const parts = [];

  // ── Draufsicht ──
  parts.push(`<text x="80" y="14" class="cap" text-anchor="middle">Von oben</text>`);
  let cam, target;
  if (upright) {
    // Person in der Mitte, Blick nach unten
    parts.push(`<ellipse cx="80" cy="64" rx="22" ry="9" class="body"/>`);
    parts.push(`<circle cx="80" cy="64" r="7" class="head"/>`);
    parts.push(`<path d="M76 71 L80 77 L84 71 Z" class="nose"/>`);
    if (ex.pos === 'sit') parts.push(`<rect x="62" y="44" width="36" height="16" rx="2" class="prop"/>`);
    target = [80, 64];
    cam = ex.view === 'front' ? [80, 146, 0] : [150, 64, -90];
  } else {
    // liegend / Vierfüßler: Körper längs
    parts.push(`<rect x="22" y="52" width="116" height="26" rx="4" class="mat"/>`);
    parts.push(`<ellipse cx="86" cy="65" rx="34" ry="8" class="body"/>`);
    parts.push(`<circle cx="44" cy="65" r="7" class="head"/>`);
    target = [80, 65];
    cam = ex.view === 'front' ? [8 + 0, 65, 90] : [80, 146, 0];
  }
  // Blickkegel
  const [cx, cy] = cam;
  const dx = target[0] - cx, dy = target[1] - cy;
  const len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, spread = 26;
  parts.push(`<path d="M${cx} ${cy} L${target[0] + nx * spread} ${target[1] + ny * spread} L${target[0] - nx * spread} ${target[1] - ny * spread} Z" class="cone"/>`);
  parts.push(phone(cx, cy, cam[2]));
  const mx = (cx + target[0]) / 2 + nx * 10, my = (cy + target[1]) / 2 + ny * 10;
  parts.push(`<text x="${mx}" y="${my}" class="dist" text-anchor="middle">${ex.cam.dist}</text>`);

  // ── Seitenansicht ──
  parts.push(`<line x1="168" y1="8" x2="168" y2="160" class="divider"/>`);
  parts.push(`<text x="246" y="14" class="cap" text-anchor="middle">Höhe</text>`);
  parts.push(line(176, 150, 316, 150, 'floor'));
  const f = FIGS[ex.pos] || FIGS.stand;
  (f.props || []).forEach((p) => parts.push(line(...p, 'propl')));
  f.l.forEach((p) => parts.push(line(...p)));
  parts.push(`<circle cx="${f.h[0]}" cy="${f.h[1]}" r="7" class="headl"/>`);
  const ph = HEIGHTS[ex.cam.height] ?? 100;
  parts.push(line(304, 150, 304, Math.min(ph + 10, 150), 'stand'));
  parts.push(phone(304, ph, 0));
  parts.push(`<line x1="296" y1="${ph}" x2="${f.h[0] + 10}" y2="${(ph + 120) / 2}" class="sight"/>`);
  parts.push(`<text x="300" y="${ph - 16}" class="dist" text-anchor="end">${ex.cam.height}</text>`);

  const viewTxt = ex.view === 'front' ? 'Kamera schaut dich von vorne an' : 'Kamera schaut dich von der Seite an';
  return `<svg viewBox="0 0 320 168" role="img" aria-label="${viewTxt}, ${ex.cam.height}, Abstand ${ex.cam.dist}" class="camsvg">${parts.join('')}</svg>`;
}

export function cameraText(ex) {
  const dir = ex.view === 'front' ? 'frontal vor dir' : 'seitlich neben dir';
  return `Handy ${dir}, ${ex.cam.height}, ${ex.cam.dist} entfernt. Ganzer Körper im Bild.`;
}
