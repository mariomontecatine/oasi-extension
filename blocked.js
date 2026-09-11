import { atText, findBlockingList, findNextChange, loadLists } from './schedule.js';

const url = new URLSearchParams(location.search).get('url') ?? '';
let host = 'Esta web';
let safeUrl = '';
try {
  const parsed = new URL(url);
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    host = parsed.hostname.replace(/^www\./, '');
    safeUrl = parsed.href;
  }
} catch {}

const page = document.getElementById('blocked');
const listTag = document.getElementById('list');
const title = document.getElementById('title');
const detail = document.getElementById('detail');
const go = document.getElementById('go');

go.textContent = `Ir a ${host}`;
if (safeUrl) go.href = safeUrl;

async function update() {
  const lists = await loadLists();
  const now = new Date();
  const list = findBlockingList(safeUrl, lists, now);

  page.classList.toggle('free', !list);
  go.hidden = Boolean(list) || !safeUrl;

  if (!list) {
    document.title = host;
    listTag.hidden = true;
    title.textContent = `${host} ya está disponible`;
    detail.textContent = 'El bloqueo ha terminado.';
    return;
  }

  const until = findNextChange(t => Boolean(findBlockingList(safeUrl, lists, t)), now);
  document.title = `Bloqueada · ${host}`;
  listTag.hidden = !list.name.trim();
  listTag.textContent = list.name.trim();
  title.textContent = `${host} está bloqueada`;
  detail.textContent = until
    ? `Podrás entrar de nuevo ${atText(until, now)}.`
    : 'Está bloqueada todos los días, a todas horas.';
}

update();
setInterval(update, 15_000);
chrome.storage.onChanged.addListener(update);
