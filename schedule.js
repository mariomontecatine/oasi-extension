// Lógica compartida por el service worker, las opciones, el popup y la página de bloqueo.

export const DAYS = [
  { value: 1, short: 'L', name: 'lunes' },
  { value: 2, short: 'M', name: 'martes' },
  { value: 3, short: 'X', name: 'miércoles' },
  { value: 4, short: 'J', name: 'jueves' },
  { value: 5, short: 'V', name: 'viernes' },
  { value: 6, short: 'S', name: 'sábado' },
  { value: 0, short: 'D', name: 'domingo' },
];

export const DAY_PRESETS = {
  all: [1, 2, 3, 4, 5, 6, 0],
  weekdays: [1, 2, 3, 4, 5],
  weekend: [6, 0],
};

export async function loadLists() {
  const { lists = [] } = await chrome.storage.local.get('lists');
  return lists;
}

export function saveLists(lists) {
  return chrome.storage.local.set({ lists });
}

export function createList() {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    sites: [],
    days: [...DAY_PRESETS.weekdays],
    allDay: false,
    intervals: [{ start: '09:00', end: '17:00' }],
  };
}

// "https://www.Chess.com/play/" → "chess.com/play". Devuelve '' si no parece una web.
export function normalizeSite(input) {
  const text = input.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  if (!text || /\s/.test(text)) return '';
  try {
    const url = new URL(`http://${text}`);
    const host = url.hostname.replace(/^www\./, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return '';
    return host + url.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

// Una web incluye sus subdominios: "chess.com" cubre también "www.chess.com" y "blog.chess.com".
export function matchesSite(url, site) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.replace(/^www\./, '');
  const slash = site.indexOf('/');
  const domain = slash === -1 ? site : site.slice(0, slash);
  const path = slash === -1 ? '' : site.slice(slash);
  if (host !== domain && !host.endsWith(`.${domain}`)) return false;

  const pathname = parsed.pathname.toLowerCase();
  return !path || pathname === path || pathname.startsWith(`${path}/`);
}

export function toMinutes(clock) {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

export function fromMinutes(total) {
  const minutes = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

// Una franja que termina antes de empezar (23:00–01:00) cruza la medianoche
// y pertenece al día en que empieza. Si inicio y fin coinciden, dura todo el día.
export function isScheduledAt(list, date) {
  const day = date.getDay();
  const minute = date.getHours() * 60 + date.getMinutes();
  const onDay = d => list.days.includes(d);

  if (list.allDay) return onDay(day);
  return list.intervals.some(({ start, end }) => {
    const from = toMinutes(start);
    const to = toMinutes(end);
    if (from === to) return onDay(day);
    if (from < to) return onDay(day) && minute >= from && minute < to;
    return (onDay(day) && minute >= from) || (onDay((day + 6) % 7) && minute < to);
  });
}

export function isActiveAt(list, date) {
  return list.enabled && list.sites.length > 0 && isScheduledAt(list, date);
}

export function findBlockingList(url, lists, date) {
  return lists.find(list => isActiveAt(list, date) && list.sites.some(site => matchesSite(url, site)));
}

// Primer minuto después de `from` en el que `test` cambia de resultado, o null si no cambia en una semana.
export function findNextChange(test, from = new Date()) {
  const initial = test(from);
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  for (let i = 0; i < 8 * 1440; i++) {
    cursor.setMinutes(cursor.getMinutes() + 1);
    if (test(cursor) !== initial) return new Date(cursor);
  }
  return null;
}

// Tramos [inicio, fin) en minutos para dibujar la franja de 24 h.
export function segmentsOf(list) {
  if (list.allDay) return [[0, 1440]];
  return list.intervals.flatMap(({ start, end }) => {
    const from = toMinutes(start);
    const to = toMinutes(end);
    if (from === to) return [[0, 1440]];
    return from < to ? [[from, to]] : [[from, 1440], [0, to]];
  });
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function clock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dayWord(date, now) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return '';
  if (diff === 1) return 'mañana';
  return `el ${DAYS.find(d => d.value === date.getDay()).name}`;
}

// "hasta las 14:00", "hasta mañana a las 09:00"
export function untilText(date, now = new Date()) {
  const day = dayWord(date, now);
  return day ? `hasta ${day} a las ${clock(date)}` : `hasta las ${clock(date)}`;
}

// "a las 16:00", "el lunes a las 09:00"
export function atText(date, now = new Date()) {
  const day = dayWord(date, now);
  return day ? `${day} a las ${clock(date)}` : `a las ${clock(date)}`;
}

export function statusOf(list, now = new Date()) {
  if (!list.sites.length) return { state: 'idle', text: 'Añade alguna web para empezar' };
  if (!list.enabled) return { state: 'paused', text: 'En pausa' };
  if (!list.days.length) return { state: 'idle', text: 'Elige al menos un día' };
  if (!list.allDay && !list.intervals.length) return { state: 'idle', text: 'Añade una franja horaria' };

  const next = findNextChange(t => isActiveAt(list, t), now);
  if (isActiveAt(list, now)) {
    return { state: 'on', text: next ? `Bloqueando ahora · ${untilText(next, now)}` : 'Bloqueando ahora · siempre' };
  }
  return { state: 'off', text: next ? `Libre · se bloquea ${atText(next, now)}` : 'Libre' };
}
