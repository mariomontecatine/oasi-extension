import {
  DAYS,
  DAY_PRESETS,
  createList,
  fromMinutes,
  loadLists,
  normalizeSite,
  saveLists,
  segmentsOf,
  statusOf,
  toMinutes,
} from './schedule.js';

const listsEl = document.getElementById('lists');
const emptyEl = document.getElementById('empty');
const savedEl = document.getElementById('saved');
const listTemplate = document.getElementById('list-template');
const intervalTemplate = document.getElementById('interval-template');

let lists = await loadLists();
let refreshers = [];

// Guardado automático

let saveTimer = null;
let toastTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

async function save() {
  clearTimeout(saveTimer);
  saveTimer = null;
  await saveLists(lists);
  savedEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => savedEl.classList.remove('show'), 1200);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && saveTimer) save();
});

// Pintado

function renderAll() {
  refreshers = [];
  listsEl.replaceChildren(...lists.map(renderCard));
  emptyEl.hidden = lists.length > 0;
}

function sameDays(a, b) {
  return a.length === b.length && a.every(day => b.includes(day));
}

function intervalNote({ start, end }) {
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === to) return 'las 24 horas';
  if (to < from && to !== 0) return 'hasta el día siguiente';
  return '';
}

// Hora y minutos como dos desplegables: siempre en formato 24 h, sea cual sea el idioma del sistema.
function fillTimePicker(container, value, label, onChange) {
  const [hours, minutes] = value.split(':');
  const hour = numberSelect(24, 1, hours, `${label}: hora`);
  const minute = numberSelect(12, 5, minutes, `${label}: minutos`);
  const emit = () => onChange(`${hour.value}:${minute.value}`);
  hour.addEventListener('change', emit);
  minute.addEventListener('change', emit);
  container.append(hour, ':', minute);
}

function numberSelect(count, step, selected, label) {
  const values = Array.from({ length: count }, (_, i) => String(i * step).padStart(2, '0'));
  if (!values.includes(selected)) values.push(selected);
  values.sort();

  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  select.append(...values.map(v => new Option(v, v, false, v === selected)));
  return select;
}

function renderCard(list) {
  const card = listTemplate.content.firstElementChild.cloneNode(true);
  const $ = selector => card.querySelector(selector);

  // Cabecera

  const name = $('.name');
  name.value = list.name;
  name.addEventListener('input', () => {
    list.name = name.value;
    scheduleSave();
  });

  const enabled = $('.enabled');
  enabled.checked = list.enabled;
  enabled.addEventListener('change', () => {
    list.enabled = enabled.checked;
    changed();
  });

  $('.delete').addEventListener('click', () => {
    const label = list.name.trim() || 'sin nombre';
    if (!confirm(`¿Eliminar la lista «${label}»?`)) return;
    lists = lists.filter(item => item !== list);
    renderAll();
    save();
  });

  // Webs

  const sitesBox = $('.sites');
  const chips = $('.chips');
  const siteInput = $('.site-input');
  const siteError = $('.site-error');

  const renderChips = () => {
    chips.replaceChildren(...list.sites.map(site => {
      const chip = document.createElement('li');
      chip.className = 'chip';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Quitar ${site}`);
      remove.addEventListener('click', () => {
        list.sites = list.sites.filter(item => item !== site);
        renderChips();
        changed();
      });
      chip.append(site, remove);
      return chip;
    }));
  };

  const addSites = text => {
    const invalid = [];
    for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
      const site = normalizeSite(token);
      if (!site) invalid.push(token);
      else if (!list.sites.includes(site)) list.sites.push(site);
    }
    siteInput.value = invalid.join(' ');
    siteError.hidden = invalid.length === 0;
    renderChips();
    changed();
  };

  siteInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addSites(siteInput.value);
    }
  });
  siteInput.addEventListener('paste', event => {
    const text = event.clipboardData.getData('text');
    if (!/[\s,;]/.test(text.trim())) return;
    event.preventDefault();
    addSites(`${siteInput.value} ${text}`);
  });
  siteInput.addEventListener('input', () => {
    siteError.hidden = true;
  });
  siteInput.addEventListener('blur', () => {
    if (siteInput.value.trim()) addSites(siteInput.value);
  });
  sitesBox.addEventListener('click', event => {
    if (event.target === sitesBox) siteInput.focus();
  });

  // Días

  const dayButtons = DAYS.map(day => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day';
    button.textContent = day.short;
    button.title = day.name;
    button.setAttribute('aria-label', day.name);
    button.addEventListener('click', () => {
      list.days = list.days.includes(day.value)
        ? list.days.filter(value => value !== day.value)
        : [...list.days, day.value];
      syncDays();
      changed();
    });
    return button;
  });
  $('.days').append(...dayButtons);

  const presetButtons = [...card.querySelectorAll('.preset')];
  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      list.days = [...DAY_PRESETS[button.dataset.preset]];
      syncDays();
      changed();
    });
  }

  const syncDays = () => {
    DAYS.forEach((day, i) => dayButtons[i].setAttribute('aria-pressed', list.days.includes(day.value)));
    for (const button of presetButtons) {
      button.setAttribute('aria-pressed', sameDays(list.days, DAY_PRESETS[button.dataset.preset]));
    }
  };

  // Horas

  const allDay = $('.all-day');
  const editor = $('.interval-editor');
  const intervalsEl = $('.intervals');

  allDay.checked = list.allDay;
  editor.hidden = list.allDay;
  allDay.addEventListener('change', () => {
    list.allDay = allDay.checked;
    editor.hidden = list.allDay;
    changed();
  });

  const renderIntervals = () => {
    intervalsEl.replaceChildren(...list.intervals.map(interval => {
      const row = intervalTemplate.content.firstElementChild.cloneNode(true);
      const note = row.querySelector('.note');
      note.textContent = intervalNote(interval);

      for (const key of ['start', 'end']) {
        const label = key === 'start' ? 'Inicio' : 'Fin';
        fillTimePicker(row.querySelector(`.${key}`), interval[key], label, value => {
          interval[key] = value;
          note.textContent = intervalNote(interval);
          changed();
        });
      }

      row.querySelector('.remove').addEventListener('click', () => {
        list.intervals = list.intervals.filter(item => item !== interval);
        renderIntervals();
        changed();
      });
      return row;
    }));
  };

  $('.add-interval').addEventListener('click', () => {
    const last = list.intervals.at(-1);
    const start = last ? toMinutes(last.end) + 60 : 9 * 60;
    list.intervals.push({ start: fromMinutes(start), end: fromMinutes(start + 120) });
    renderIntervals();
    changed();
    intervalsEl.lastElementChild.querySelector('.start select').focus();
  });

  // Estado y línea de 24 h

  const status = $('.status');
  const track = $('.track');
  const nowMarker = $('.now');

  const refresh = () => {
    const now = new Date();
    const { state, text } = statusOf(list, now);
    status.className = `status ${state}`;
    status.textContent = text;
    card.classList.toggle('paused', !list.enabled);

    track.replaceChildren(...segmentsOf(list).map(([from, to]) => {
      const segment = document.createElement('div');
      segment.className = 'segment';
      segment.style.left = `${(from / 1440) * 100}%`;
      segment.style.width = `${((to - from) / 1440) * 100}%`;
      return segment;
    }));

    nowMarker.hidden = !list.days.includes(now.getDay());
    nowMarker.style.left = `${((now.getHours() * 60 + now.getMinutes()) / 1440) * 100}%`;
  };

  function changed() {
    refresh();
    scheduleSave();
  }

  renderChips();
  syncDays();
  renderIntervals();
  refresh();
  refreshers.push(refresh);
  return card;
}

document.getElementById('add-list').addEventListener('click', () => {
  lists.push(createList());
  renderAll();
  save();
  const card = listsEl.lastElementChild;
  card.querySelector('.name').focus({ preventScroll: true });
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

setInterval(() => refreshers.forEach(refresh => refresh()), 30_000);

renderAll();
