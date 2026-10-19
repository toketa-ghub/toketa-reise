/* Lokaler Speicher für mehrere Reisen + Datenmigration.
   Jede Reise ist ein einzelnes JSON-Objekt (state). Gespeichert wird immer lokal;
   der Abgleich mit Firestore läuft separat in sync.js. */

const KEY = 'toketa-reise:v2';
const UIKEY = 'toketa-reise:v2:ui';

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = (s) => { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return isoOf(d); };

export function loadStore() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.trips) return s; } catch (e) { /* leer */ }
  return { trips: {}, active: null };
}
export function saveStore(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* voll oder gesperrt */ } }
export function loadUi() { try { return JSON.parse(localStorage.getItem(UIKEY)) || {}; } catch (e) { return {}; } }
export function saveUi(ui) { try { localStorage.setItem(UIKEY, JSON.stringify(ui)); } catch (e) { /* egal */ } }

/* Farbnamen früherer Versionen auf die Toketa-Farben abbilden */
const COLOR_MAP = { red: 'blue', gold: 'lav', sky: 'mid', indigo: 'ink', green: 'slate', pink: 'mid', gray: 'gray', blue: 'blue', mid: 'mid', lav: 'lav', ink: 'ink', slate: 'slate' };

/* Frühere Daten (Japan-Planer v1) und neuere Reisen auf den aktuellen Stand bringen */
export function migrate(s, opts) {
  opts = opts || {};
  if (!s || !s.days || !s.check) throw new Error('Datei ist keine Reise-Sicherung');
  const legacy = !(s.trip && s.trip.name); // alte Sicherung aus der ersten Version: Farbnamen übersetzen
  s.trip = s.trip || {};
  const dayKeys = Object.keys(s.days).sort();
  if (!s.trip.start) s.trip.start = dayKeys[0];
  if (!s.trip.end) s.trip.end = dayKeys[dayKeys.length - 1];
  if (!s.trip.day1) s.trip.day1 = s.trip.start;
  if (!s.trip.home) s.trip.home = s.trip.end;
  if (!s.trip.name) s.trip.name = opts.name || 'Meine Reise';
  if (s.trip.kicker == null) s.trip.kicker = opts.kicker || '';
  s.holidays = s.holidays || opts.holidays || {};
  s.infos = s.infos || opts.infos || [];
  s.infos.forEach((i) => { if (!i.id) i.id = uid(); i.items = i.items || []; });
  if (s.infoNote == null) s.infoNote = opts.infoNote || '';
  s.places = s.places || {};
  const OK = ['blue', 'mid', 'lav', 'ink', 'slate', 'gray', 'red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'pink', 'purple', 'brown'];
  Object.keys(s.places).forEach((p) => { const c = s.places[p]; s.places[p] = legacy ? (COLOR_MAP[c] || 'gray') : (OK.includes(c) ? c : 'gray'); });
  s.stays = s.stays || []; s.todos = s.todos || []; s.notes = s.notes || [];
  s.budget = s.budget || { limit: 0, rate: 1, fixed: [], spent: [] };
  s.budget.fixed = s.budget.fixed || []; s.budget.spent = s.budget.spent || [];
  if (s.budget.sym == null) s.budget.sym = '¥'; // v1 rechnete immer in Yen
  const fx = (o) => { if (o && o.cur === '¥') o.cur = 'fx'; };
  Object.keys(s.days).forEach((d) => { s.days[d].entries = s.days[d].entries || []; s.days[d].entries.forEach(fx); });
  s.todos.forEach(fx); s.budget.spent.forEach(fx);
  s.rev = s.rev || 0;
  return s;
}

function starterCheck() {
  const g = (name, phase, items) => ({ id: uid(), name, phase, items: items.map((t) => ({ id: uid(), t, done: false })) });
  return [
    g('Dokumente & Buchungen', 'prep', ['Reisepass / Ausweis prüfen', 'Flug- und Unterkunftsbestätigungen speichern', 'Auslandskrankenversicherung', 'Kreditkarte und Bargeld']),
    g('Packliste', 'pack', ['Ladegeräte und Adapter', 'Medikamente', 'Kleidung für das Wetter', 'Kulturbeutel']),
    g('Unterwegs', 'site', ['SIM / eSIM oder Roaming klären', 'Offline-Karten laden'])
  ];
}

/* Neue, leere Reise */
export function newTripState(o) {
  const start = o.start, end = o.end >= o.start ? o.end : o.start;
  const days = {};
  for (let d = start; d <= end; d = addDays(d, 1)) days[d] = { place: '', note: '', entries: [] };
  return {
    rev: 0,
    trip: { name: o.name || 'Neue Reise', kicker: o.kicker || '', start, end, day1: start, home: end },
    places: {}, days, stays: [], check: starterCheck(), todos: [], notes: [], infos: [], infoNote: '', holidays: {},
    budget: { limit: 0, sym: '', rate: 1, fixed: [], spent: [] }
  };
}
