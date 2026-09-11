import { loadLists, statusOf } from './schedule.js';

const listsEl = document.getElementById('lists');
const emptyEl = document.getElementById('empty');
const openButton = document.getElementById('open');

function openOptions() {
  chrome.runtime.openOptionsPage();
  window.close();
}

openButton.addEventListener('click', openOptions);

const lists = await loadLists();
const now = new Date();

emptyEl.hidden = lists.length > 0;
openButton.textContent = lists.length ? 'Editar listas' : 'Crear una lista';

listsEl.replaceChildren(...lists.map(list => {
  const { state, text } = statusOf(list, now);

  const name = document.createElement('strong');
  name.textContent = list.name.trim() || 'Sin nombre';
  const status = document.createElement('span');
  status.className = `status ${state}`;
  status.textContent = text;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'popup-item';
  button.append(name, status);
  button.addEventListener('click', openOptions);

  const item = document.createElement('li');
  item.append(button);
  return item;
}));
