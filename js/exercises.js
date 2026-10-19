// Übungsbibliothek – Rücken & Hüfte bei Skoliose
// Felder:
//  cat:   warmup | mobility | hip | stability | posture | relax
//  equip: benötigte Hilfsmittel (alle müssen verfügbar sein)
//  pos:   stand | sit | quad | supine | prone | kneel | floorsit
//  view:  front | side  (Kamerablick auf den Körper)
//  type:  hold (Position halten) | flow (Bewegung im Rhythmus)
//  reps/hold/rest: Standarddosierung (Sekunden); sides: 2 = je Seite
//  checks: Haltungsprüfungen (siehe pose.js CHECKS)
//  src:   Herkunft (Blatt = "Aktives Rückentraining"-Übersicht)

export const EQUIPMENT = [
  { id: 'stuhl', label: 'Stuhl' },
  { id: 'matte', label: 'Matte' },
  { id: 'band', label: 'Gummiband' },
  { id: 'hanteln', label: 'Kurzhanteln / Wasserflaschen' },
  { id: 'hocker', label: 'Hocker / Sofa' },
  { id: 'wand', label: 'Freie Wand' },
  { id: 'kissen', label: 'Kissen / Handtuchrolle' },
  { id: 'ball', label: 'Gymnastikball' },
  { id: 'rolle', label: 'Faszienrolle' },
  { id: 'stab', label: 'Stab / Besenstiel' },
];

export const CATEGORIES = {
  warmup: 'Aufwärmen',
  mobility: 'Mobilisation',
  hip: 'Hüfte lösen',
  stability: 'Kräftigung',
  posture: 'Aufrichtung',
  relax: 'Entspannung',
};

export const EXERCISES = [
  // ── Aufwärmen ──────────────────────────────────────────────
  {
    id: 'marschieren', name: 'Marschieren mit Armkreisen', cat: 'warmup', equip: [], pos: 'stand', view: 'front',
    cam: { height: 'Hüfthöhe', dist: '2–2,5 m' }, type: 'flow', reps: 1, hold: 40, rest: 0, sides: 1,
    steps: ['Locker auf der Stelle marschieren, Knie anheben.', 'Arme abwechselnd vorwärts und rückwärts kreisen.', 'Ruhig weiteratmen.'],
    cue: 'Locker marschieren, Arme kreisen.', checks: ['headCentered'], goal: 'Kreislauf in Schwung bringen', src: 'Blatt (Aufwärmen)',
  },
  {
    id: 'hueftkreisen', name: 'Hüftkreisen im Stand', cat: 'warmup', equip: [], pos: 'stand', view: 'front',
    cam: { height: 'Hüfthöhe', dist: '2–2,5 m' }, type: 'flow', reps: 2, hold: 20, rest: 5, sides: 1,
    steps: ['Hüftbreit stehen, Hände an die Hüfte.', 'Becken in großen, ruhigen Kreisen bewegen.', 'Oberkörper bleibt möglichst ruhig.', 'Zweiter Durchgang: andere Richtung.'],
    cue: 'Becken langsam kreisen, Schultern bleiben ruhig.', checks: ['shouldersLevel'], goal: 'Hüfte und Lendenwirbelsäule mobilisieren', src: 'Physio-Standard',
  },
  {
    id: 'beckenbalance', name: 'Beckenbalance im Sitz', cat: 'warmup', equip: ['stuhl'], pos: 'sit', view: 'side',
    cam: { height: 'Sitzhöhe', dist: '1,5–2 m' }, type: 'flow', reps: 2, hold: 25, rest: 5, sides: 1,
    steps: ['Vorne auf den Stuhl setzen, Füße hüftbreit.', 'Becken langsam zwischen Rundrücken und Hohlkreuz pendeln.', 'Zum Schluss in der Mitte aufrecht ankommen.'],
    cue: 'Becken langsam vor und zurück kippen.', checks: [], goal: 'Becken mobilisieren, aufrechte Sitzhaltung finden', src: 'Blatt Übung 1',
  },
  {
    id: 'schulterkreisen', name: 'Schulterkreisen rückwärts', cat: 'warmup', equip: [], pos: 'stand', view: 'front',
    cam: { height: 'Brusthöhe', dist: '1,5–2 m' }, type: 'flow', reps: 2, hold: 20, rest: 5, sides: 1,
    steps: ['Aufrecht stehen, Arme hängen locker.', 'Schultern in großen Kreisen rückwärts bewegen.', 'Kopf zieht nach oben.'],
    cue: 'Große Kreise rückwärts, Kopf lang machen.', checks: ['headCentered', 'trunkCentered'], goal: 'Schulter-Nacken lockern', src: 'Blatt Übung 2',
  },

  // ── Mobilisation ───────────────────────────────────────────
  {
    id: 'katze_kuh', name: 'Katze und Kuh', cat: 'mobility', equip: ['matte'], pos: 'quad', view: 'side',
    cam: { height: 'Boden', dist: '1,5–2 m' }, type: 'flow', reps: 2, hold: 25, rest: 5, sides: 1,
    steps: ['Vierfüßlerstand: Hände unter den Schultern, Knie unter der Hüfte.', 'Ausatmen: Rücken rund machen, Kinn zur Brust.', 'Einatmen: Brustbein nach vorne schieben, Blick leicht nach vorn.'],
    cue: 'Mit dem Atem: rund machen, dann lang machen.', checks: ['handsUnderShoulders', 'kneesUnderHips'], goal: 'Wirbelsäule segmentweise bewegen', src: 'Physio-Standard',
  },
  {
    id: 'nadel_einfaedeln', name: 'Brustwirbel-Rotation im Vierfüßler', cat: 'mobility', equip: ['matte'], pos: 'quad', view: 'side',
    cam: { height: 'Boden', dist: '1,5–2 m' }, type: 'flow', reps: 1, hold: 25, rest: 5, sides: 2,
    steps: ['Vierfüßlerstand.', 'Einen Arm unter dem Körper durchfädeln, Schulter Richtung Boden.', 'Dann den Arm zur Decke öffnen und dem Blick folgen.', 'Becken bleibt über den Knien.'],
    cue: 'Arm einfädeln, dann zur Decke öffnen.', checks: ['kneesUnderHips'], goal: 'Brustwirbelsäule rotieren', src: 'Physio-Standard',
  },
  {
    id: 'wandengel', name: 'Wand-Engel', cat: 'mobility', equip: ['wand'], pos: 'stand', view: 'front',
    cam: { height: 'Brusthöhe', dist: '2 m' }, type: 'flow', reps: 2, hold: 25, rest: 8, sides: 1,
    steps: ['Rücken an die Wand, Füße eine Handbreit davor.', 'Arme in U-Form an die Wand legen.', 'Arme langsam nach oben und wieder in die U-Form gleiten lassen.', 'Unterer Rücken bleibt nah an der Wand.'],
    cue: 'Arme gleichmäßig hoch und runter gleiten lassen.', checks: ['armsSymmetric', 'shouldersLevel', 'headCentered'], goal: 'Schultergürtel öffnen, Brustwirbelsäule aufrichten', src: 'Physio-Standard',
  },
  {
    id: 'kinn_einziehen', name: 'Kinn einziehen', cat: 'mobility', equip: ['stuhl'], pos: 'sit', view: 'side',
    cam: { height: 'Kopfhöhe sitzend', dist: '1,5 m' }, type: 'hold', reps: 5, hold: 6, rest: 4, sides: 1,
    steps: ['Aufrecht sitzen.', 'Kinn waagerecht nach hinten schieben (Doppelkinn).', 'Hinterkopf zieht nach oben, kurz halten.'],
    cue: 'Kinn nach hinten, Hinterkopf nach oben.', checks: ['earOverShoulder', 'trunkUpright'], goal: 'Halswirbelsäule stabilisieren', src: 'Physio-Standard',
  },
  {
    id: 'bws_stuhllehne', name: 'Brustkorb-Streckung an der Stuhllehne', cat: 'mobility', equip: ['stuhl'], pos: 'sit', view: 'side',
    cam: { height: 'Sitzhöhe', dist: '1,5–2 m' }, type: 'hold', reps: 4, hold: 8, rest: 6, sides: 1,
    steps: ['Mit dem Rücken an die Lehne setzen, Hände hinter dem Kopf.', 'Brustbein nach oben schieben, über die Lehne strecken.', 'Ellbogen offen, ruhig atmen.'],
    cue: 'Brustbein nach oben, ruhig atmen.', checks: [], goal: 'Brustwirbelsäule strecken', src: 'Physio-Standard',
  },
  {
    id: 'rolle_laengs', name: 'Brustöffner auf der Faszienrolle', cat: 'mobility', equip: ['rolle', 'matte'], pos: 'supine', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'hold', reps: 2, hold: 40, rest: 10, sides: 1,
    steps: ['Rolle längs unter die Wirbelsäule, Kopf liegt auf der Rolle.', 'Füße aufstellen, Arme seitlich in U-Form ablegen.', 'Schultern sinken lassen, ruhig atmen.'],
    cue: 'Schultern sinken lassen, ruhig atmen.', checks: [], goal: 'Brustmuskulatur dehnen, Brustkorb öffnen', src: 'Physio-Standard',
  },
  {
    id: 'ball_beckenkreisen', name: 'Beckenkreisen auf dem Ball', cat: 'mobility', equip: ['ball'], pos: 'sit', view: 'front',
    cam: { height: 'Sitzhöhe', dist: '2 m' }, type: 'flow', reps: 2, hold: 25, rest: 5, sides: 1,
    steps: ['Aufrecht auf den Ball setzen, Füße fest am Boden.', 'Becken in Kreisen bewegen, Oberkörper bleibt ruhig.', 'Zweiter Durchgang: andere Richtung.'],
    cue: 'Becken kreist, Kopf bleibt in der Mitte.', checks: ['headCentered', 'shouldersLevel'], goal: 'Becken und Lendenwirbelsäule mobilisieren', src: 'Physio-Standard',
  },

  // ── Hüfte lösen ────────────────────────────────────────────
  {
    id: 'hueftbeuger_halbknie', name: 'Hüftbeuger-Dehnung im Halbkniestand', cat: 'hip', equip: ['matte'], pos: 'kneel', view: 'side',
    cam: { height: 'Hüfthöhe', dist: '2 m' }, type: 'hold', reps: 2, hold: 25, rest: 8, sides: 2,
    steps: ['Ein Knie auf die Matte (Kissen darunter), anderer Fuß vorne aufgestellt.', 'Gesäß anspannen, Becken leicht nach vorne schieben.', 'Oberkörper bleibt aufrecht, nicht ins Hohlkreuz.'],
    cue: 'Gesäß anspannen, Becken nach vorn, Oberkörper aufrecht.', checks: ['trunkUpright'], goal: 'Hüftbeuger dehnen gegen Hüftsteifigkeit', src: 'Physio-Standard',
  },
  {
    id: 'hueftbeuger_stand', name: 'Hüftbeuger-Dehnung im Stand', cat: 'hip', equip: [], pos: 'stand', view: 'side',
    cam: { height: 'Hüfthöhe', dist: '2–2,5 m' }, type: 'hold', reps: 2, hold: 20, rest: 6, sides: 2,
    steps: ['Großer Schritt nach vorne, hinteres Bein gestreckt, Ferse hoch.', 'Gesäß anspannen, Becken nach vorne schieben.', 'Oberkörper aufrecht, eventuell an einer Wand abstützen.'],
    cue: 'Becken nach vorn, Oberkörper bleibt senkrecht.', checks: ['trunkUpright'], goal: 'Hüftbeuger dehnen, ohne Matte', src: 'Physio-Standard',
  },
  {
    id: 'neunzig_neunzig', name: '90/90-Hüftdehnung', cat: 'hip', equip: ['matte'], pos: 'floorsit', view: 'front',
    cam: { height: 'Boden bis Kniehöhe', dist: '2 m' }, type: 'hold', reps: 2, hold: 30, rest: 8, sides: 2,
    steps: ['Am Boden sitzen, vorderes Bein im 90°-Winkel nach außen gedreht.', 'Hinteres Bein ebenfalls 90°, zur Seite nach hinten.', 'Aufrecht sitzen, Schultern gerade, nicht zur Seite lehnen.', 'Bei Bedarf auf ein Kissen setzen.'],
    cue: 'Aufrecht sitzen, Schultern gerade, ruhig atmen.', checks: ['shouldersLevel', 'trunkCentered'], goal: 'Innen- und Außenrotation der Hüfte verbessern', src: 'Cleveland Clinic',
  },
  {
    id: 'piriformis_ruecken', name: 'Gesäßdehnung in Rückenlage', cat: 'hip', equip: ['matte'], pos: 'supine', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'hold', reps: 2, hold: 30, rest: 6, sides: 2,
    steps: ['Rückenlage, Beine aufgestellt.', 'Einen Knöchel auf das andere Knie legen (Zahl 4).', 'Unteres Bein zur Brust ziehen, Kopf bleibt liegen.'],
    cue: 'Bein sanft heranziehen, Kopf bleibt am Boden.', checks: [], goal: 'Gesäß- und Piriformismuskel dehnen', src: 'Physio-Standard',
  },
  {
    id: 'piriformis_sitz', name: 'Gesäßdehnung im Sitz', cat: 'hip', equip: ['stuhl'], pos: 'sit', view: 'side',
    cam: { height: 'Sitzhöhe', dist: '1,5–2 m' }, type: 'hold', reps: 2, hold: 25, rest: 6, sides: 2,
    steps: ['Aufrecht sitzen, einen Knöchel auf das andere Knie.', 'Mit langem Rücken aus der Hüfte nach vorne neigen.', 'Nicht rund werden.'],
    cue: 'Langer Rücken, aus der Hüfte nach vorne.', checks: [], goal: 'Gesäß dehnen, auch im Büro', src: 'Physio-Standard',
  },
  {
    id: 'beckenheben', name: 'Beckenheben', cat: 'hip', equip: ['matte'], pos: 'supine', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'hold', reps: 6, hold: 5, rest: 4, sides: 1,
    steps: ['Rückenlage, Füße hüftbreit aufgestellt.', 'Gesäß anspannen, Becken anheben bis Knie, Hüfte und Schulter eine Linie bilden.', 'Halten, langsam Wirbel für Wirbel ablegen.'],
    cue: 'Gesäß anspannen, Becken hoch.', checks: ['hipExtended'], goal: 'Gesäß kräftigen, Hüfte strecken', src: 'Physio-Standard',
  },
  {
    id: 'hueftbeugen_stab', name: 'Hüftbeugen mit Stab', cat: 'hip', equip: ['stab'], pos: 'stand', view: 'side',
    cam: { height: 'Hüfthöhe', dist: '2–2,5 m' }, type: 'flow', reps: 2, hold: 25, rest: 6, sides: 1,
    steps: ['Stab am Rücken: Kontakt an Hinterkopf, Brustwirbelsäule und Kreuzbein.', 'Knie leicht gebeugt, Gesäß nach hinten schieben.', 'Oberkörper neigen, bis Spannung hinten im Oberschenkel, dann aufrichten.'],
    cue: 'Gesäß nach hinten, Stab bleibt am Rücken.', checks: ['kneesSoft'], goal: 'Hüftbeugung lernen, Rücken lang halten', src: 'Physio-Standard',
  },
  {
    id: 'knie_brust', name: 'Knie zur Brust', cat: 'hip', equip: ['matte'], pos: 'supine', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'hold', reps: 2, hold: 20, rest: 5, sides: 2,
    steps: ['Rückenlage, ein Bein gestreckt.', 'Das andere Knie mit den Händen zur Brust ziehen.', 'Unterer Rücken entspannt am Boden.'],
    cue: 'Knie sanft heranziehen, Schultern locker.', checks: [], goal: 'Hüftstrecker und unteren Rücken lösen', src: 'Physio-Standard',
  },
  {
    id: 'schmetterling', name: 'Schmetterling', cat: 'hip', equip: ['matte'], pos: 'floorsit', view: 'front',
    cam: { height: 'Boden bis Kniehöhe', dist: '2 m' }, type: 'hold', reps: 2, hold: 30, rest: 6, sides: 1,
    steps: ['Aufrecht sitzen, Fußsohlen aneinander.', 'Knie sinken lassen, mit den Händen die Füße halten.', 'Aufrecht bleiben, eventuell auf ein Kissen setzen.'],
    cue: 'Aufrecht sitzen, Knie sinken lassen.', checks: ['shouldersLevel', 'trunkCentered'], goal: 'Adduktoren dehnen, Hüfte öffnen', src: 'Physio-Standard',
  },
  {
    id: 'hueftrotation_stand', name: 'Hüftkreisen auf einem Bein', cat: 'hip', equip: [], pos: 'stand', view: 'front',
    cam: { height: 'Hüfthöhe', dist: '2–2,5 m' }, type: 'flow', reps: 1, hold: 20, rest: 5, sides: 2,
    steps: ['Seitlich an Wand oder Stuhllehne festhalten.', 'Ein Knie anheben und langsam große Kreise nach außen zeichnen.', 'Becken und Schultern bleiben gerade.'],
    cue: 'Knie langsam außen herum kreisen, Becken bleibt ruhig.', checks: ['shouldersLevel'], goal: 'Hüftgelenk in alle Richtungen bewegen', src: 'Physio-Standard',
  },

  // ── Kräftigung ─────────────────────────────────────────────
  {
    id: 'vierfuessler_diagonal', name: 'Vierfüßler diagonal', cat: 'stability', equip: ['matte'], pos: 'quad', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'hold', reps: 4, hold: 6, rest: 4, sides: 2,
    steps: ['Vierfüßlerstand, Rücken lang.', 'Gegenüberliegenden Arm und Bein waagerecht ausstrecken.', 'Becken bleibt gerade, nicht kippen.'],
    cue: 'Arm und Bein waagerecht, Rücken bleibt ruhig.', checks: ['armLevel', 'legLevel', 'backFlat'], goal: 'Rumpf stabilisieren', src: 'Physio-Standard',
  },
  {
    id: 'dead_bug', name: 'Käfer (Dead Bug)', cat: 'stability', equip: ['matte'], pos: 'supine', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'flow', reps: 2, hold: 25, rest: 10, sides: 1,
    steps: ['Rückenlage, Arme zur Decke, Knie 90° über der Hüfte.', 'Gegenüberliegend Arm nach hinten und Bein nach vorn langsam absenken.', 'Unterer Rücken bleibt am Boden, abwechseln.'],
    cue: 'Langsam abwechseln, unterer Rücken bleibt am Boden.', checks: [], goal: 'Tiefe Bauchmuskulatur kräftigen', src: 'Physio-Standard',
  },
  {
    id: 'grundspannung_sitz', name: 'Aufrichtung & Grundspannung im Sitz', cat: 'posture', equip: ['stuhl'], pos: 'sit', view: 'front',
    cam: { height: 'Brusthöhe sitzend', dist: '1,5–2 m' }, type: 'hold', reps: 5, hold: 8, rest: 5, sides: 1,
    steps: ['Füße schulterbreit, Rücken gerade.', 'Füße in den Boden stemmen, Bauch und Gesäß anspannen.', 'Schultern nach hinten unten, Scheitel wächst nach oben.', 'Ruhig weiteratmen, keine Pressatmung.'],
    cue: 'Scheitel nach oben, Schultern nach hinten unten, weiteratmen.', checks: ['shouldersLevel', 'trunkCentered', 'headCentered'], goal: 'Aktive Selbstkorrektur und Aufrichtung', src: 'Blatt Übung 2 und 3',
  },
  {
    id: 'aufrichtung_stand', name: 'Aufrichtung im Stand', cat: 'posture', equip: [], pos: 'stand', view: 'front',
    cam: { height: 'Brusthöhe', dist: '2–2,5 m' }, type: 'hold', reps: 4, hold: 10, rest: 5, sides: 1,
    steps: ['Hüftbreit stehen, Gewicht gleichmäßig auf beiden Füßen.', 'Scheitel nach oben ziehen, Wirbelsäule wird lang.', 'Schultern gleich hoch, Becken gerade.', 'Ruhig in die Flanken atmen.'],
    cue: 'Lang werden, Gewicht gleich verteilen, ruhig atmen.', checks: ['shouldersLevel', 'pelvisLevel', 'trunkCentered', 'headCentered'], goal: 'Aktive Selbstkorrektur im Alltag', src: 'Skoliose-Übungsprinzip (SEAS/Schroth: aktive Selbstkorrektur)',
  },
  {
    id: 'nacken_druck', name: 'Nackenstabilisation mit Händen', cat: 'stability', equip: ['stuhl'], pos: 'sit', view: 'front',
    cam: { height: 'Brusthöhe sitzend', dist: '1,5–2 m' }, type: 'hold', reps: 4, hold: 8, rest: 5, sides: 1,
    steps: ['Aufrecht sitzen, Hände hinter dem Kopf verschränken.', 'Kopf langsam gegen die Hände drücken, Hände halten dagegen.', 'Nur so stark, wie es angenehm ist, dann langsam lösen.'],
    cue: 'Kopf sanft gegen die Hände drücken, weiteratmen.', checks: ['headCentered', 'shouldersLevel', 'armsSymmetric'], goal: 'Halswirbelsäule stabilisieren', src: 'Blatt Übung 5',
  },
  {
    id: 'arme_seit_kreise', name: 'Kleine Armkreise seitlich', cat: 'stability', equip: [], pos: 'stand', view: 'front',
    cam: { height: 'Brusthöhe', dist: '2–2,5 m' }, type: 'flow', reps: 2, hold: 20, rest: 6, sides: 1,
    steps: ['Grundspannung aufbauen, Arme seitlich auf Schulterhöhe.', 'Kleine Kreise vorwärts, dann rückwärts.', 'Kopf zieht nach oben.'],
    cue: 'Arme auf Schulterhöhe, kleine Kreise.', checks: ['wristsSymmetric', 'shouldersLevel', 'headCentered'], goal: 'Schultergürtel kräftigen', src: 'Blatt Übung 6',
  },
  {
    id: 'hampelmann_sitz', name: 'Arme heben im Sitz', cat: 'stability', equip: ['stuhl'], pos: 'sit', view: 'front',
    cam: { height: 'Brusthöhe sitzend', dist: '1,5–2 m' }, type: 'flow', reps: 2, hold: 25, rest: 6, sides: 1,
    steps: ['Brustkorb aufrichten, Schulterblätter zusammen.', 'Angewinkelte Arme über den Kopf führen und wieder auf Schulterhöhe senken.', 'Gleichmäßig auf- und abbewegen.'],
    cue: 'Beide Arme gleichmäßig hoch und runter.', checks: ['armsSymmetric', 'shouldersLevel'], goal: 'Nacken-, Schulter- und Rückenmuskulatur', src: 'Blatt Übung 7',
  },
  {
    id: 'band_zug', name: 'Gummiband auseinanderziehen', cat: 'stability', equip: ['band'], pos: 'stand', view: 'front',
    cam: { height: 'Brusthöhe', dist: '2–2,5 m' }, type: 'flow', reps: 2, hold: 30, rest: 10, sides: 1,
    steps: ['Band schulterbreit vor der Brust halten.', 'Schulterblätter zusammen, Band langsam auseinanderziehen.', 'Kontrolliert zurück, ca. 12 Wiederholungen.'],
    cue: 'Schulterblätter zusammen, Band langsam auseinander.', checks: ['wristsSymmetric', 'shouldersLevel', 'trunkCentered'], goal: 'Obere Rückenmuskulatur kräftigen', src: 'Blatt Übung 8',
  },
  {
    id: 'band_kopf', name: 'Band hinter dem Kopf', cat: 'stability', equip: ['band', 'stuhl'], pos: 'sit', view: 'front',
    cam: { height: 'Brusthöhe sitzend', dist: '1,5–2 m' }, type: 'flow', reps: 2, hold: 25, rest: 10, sides: 1,
    steps: ['Aufrecht sitzen, Band in beiden Händen über dem Kopf.', 'Schulterblätter zusammen, Band unter Spannung hinter den Kopf führen.', 'Wieder nach oben, Kopf bleibt entspannt.'],
    cue: 'Band unter Spannung hinter den Kopf und zurück.', checks: ['armsSymmetric', 'shouldersLevel', 'headCentered'], goal: 'Schulter- und Rückenmuskulatur', src: 'Blatt Übung 8',
  },
  {
    id: 'hantel_u', name: 'Hanteln in U-Form', cat: 'stability', equip: ['hanteln'], pos: 'stand', view: 'front',
    cam: { height: 'Brusthöhe', dist: '2–2,5 m' }, type: 'flow', reps: 2, hold: 25, rest: 10, sides: 1,
    steps: ['Aufrecht, Schulterblätter zusammen.', 'Arme in U-Form auf Schulterhöhe, Gewichte in den Händen.', 'Gleichmäßig nach oben drücken und zurück in die U-Form.'],
    cue: 'Ellbogen gleich hoch, gleichmäßig drücken.', checks: ['armsSymmetric', 'shouldersLevel', 'trunkCentered'], goal: 'Schultergürtel und Rücken kräftigen', src: 'Blatt Übung 9',
  },
  {
    id: 'bauchlage_schwimmen', name: 'Schwimmbewegung in Bauchlage', cat: 'stability', equip: ['matte'], pos: 'prone', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'hold', reps: 4, hold: 8, rest: 6, sides: 1,
    steps: ['Bauchlage, Kissen unter den Bauch, Stirn am Boden.', 'Arme in U-Form neben dem Kopf leicht anheben.', 'Schulterblätter zur Wirbelsäule, kleine Schwimmbewegungen.'],
    cue: 'Arme leicht anheben, Schulterblätter zusammen.', checks: [], goal: 'Gesamte Rückenmuskulatur kräftigen', src: 'Blatt Übung 12',
  },
  {
    id: 'bauchlage_spannung', name: 'Grundspannung in Bauchlage', cat: 'stability', equip: ['matte', 'kissen'], pos: 'prone', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'hold', reps: 4, hold: 8, rest: 6, sides: 1,
    steps: ['Bauchlage, festes Kissen unter dem Bauch gegen Hohlkreuz.', 'Gesäß und Bauch anspannen, Fersen nach hinten schieben.', 'Kopf leicht anheben und nach vorn herausstrecken.'],
    cue: 'Fersen nach hinten, Kopf lang nach vorn.', checks: [], goal: 'Körperspannung und Streckung', src: 'Blatt Übung 11',
  },
  {
    id: 'ball_beinheben', name: 'Beinheben auf dem Ball', cat: 'stability', equip: ['ball'], pos: 'sit', view: 'front',
    cam: { height: 'Sitzhöhe', dist: '2 m' }, type: 'hold', reps: 3, hold: 6, rest: 4, sides: 2,
    steps: ['Aufrecht auf dem Ball sitzen.', 'Einen Fuß wenige Zentimeter anheben und halten.', 'Becken und Schultern bleiben gerade.'],
    cue: 'Fuß leicht anheben, Becken bleibt gerade.', checks: ['shouldersLevel', 'trunkCentered'], goal: 'Rumpfstabilität', src: 'Physio-Standard',
  },

  // ── Entspannung ────────────────────────────────────────────
  {
    id: 'stufenlagerung_wand', name: 'Wanddruck in Stufenlagerung', cat: 'relax', equip: ['matte', 'hocker', 'wand'], pos: 'supine', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'hold', reps: 3, hold: 8, rest: 8, sides: 1,
    steps: ['Rückenlage, Unterschenkel auf dem Hocker, Füße an der Wand, Knie 90°.', 'Mit den Füßen leicht gegen die Wand drücken, Wirbelsäule in den Boden.', 'Spannung spüren, langsam lösen.'],
    cue: 'Füße leicht gegen die Wand, Rücken in den Boden.', checks: [], goal: 'Körperwahrnehmung, An- und Entspannung', src: 'Blatt Übung 10',
  },
  {
    id: 'stufenlagerung', name: 'Stufenlagerung', cat: 'relax', equip: ['matte', 'hocker'], pos: 'supine', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'hold', reps: 1, hold: 50, rest: 0, sides: 1,
    steps: ['Rückenlage, Unterschenkel auf Hocker oder Sofa, Knie 90°.', 'Arme locker neben dem Körper.', 'Langsam in den Bauch und die Flanken atmen.'],
    cue: 'Loslassen und ruhig atmen.', checks: [], goal: 'Lendenwirbelsäule entlasten', src: 'Blatt Übung 10',
  },
  {
    id: 'kindhaltung', name: 'Kindhaltung', cat: 'relax', equip: ['matte'], pos: 'quad', view: 'side',
    cam: { height: 'Boden', dist: '2 m' }, type: 'hold', reps: 2, hold: 25, rest: 5, sides: 1,
    steps: ['Aus dem Vierfüßler Gesäß zu den Fersen sinken lassen.', 'Arme lang nach vorne, Stirn ablegen.', 'In den Rücken atmen.'],
    cue: 'Gesäß zu den Fersen, in den Rücken atmen.', checks: [], goal: 'Rücken entspannen', src: 'Physio-Standard',
  },
  {
    id: 'flankenatmung', name: 'Flankenatmung', cat: 'relax', equip: [], pos: 'stand', view: 'front',
    cam: { height: 'Brusthöhe', dist: '2–2,5 m' }, type: 'hold', reps: 3, hold: 15, rest: 5, sides: 1,
    steps: ['Aufrecht stehen, Hände seitlich an die unteren Rippen.', 'Einatmen: Rippen gegen die Hände weiten, besonders auf der flacheren Seite.', 'Ausatmen: lang bleiben.'],
    cue: 'In die Flanken atmen, lang bleiben.', checks: ['shouldersLevel', 'trunkCentered'], goal: 'Brustkorb weiten, Atemwahrnehmung', src: 'Skoliose-Übungsprinzip (Atemlenkung)',
  },
];

export const byId = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

// Dauer einer Übung in Sekunden (inkl. Vorbereitung und Seitenwechsel)
export function exerciseDuration(ex, prep = 10) {
  const perSide = ex.reps * ex.hold + Math.max(0, ex.reps - 1) * ex.rest;
  return prep + perSide * ex.sides + (ex.sides - 1) * 5;
}
