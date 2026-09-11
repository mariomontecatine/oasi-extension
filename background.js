import { findBlockingList, loadLists } from './schedule.js';

const BLOCKED_PAGE = chrome.runtime.getURL('blocked.html');
const lastRedirect = new Map(); // tabId → momento de la última redirección

function blockIfNeeded(tabId, url, lists) {
  if (tabId < 0 || !url?.startsWith('http')) return;
  if (!findBlockingList(url, lists, new Date())) return;

  // onBeforeNavigate y onUpdated avisan casi a la vez de la misma navegación.
  const last = lastRedirect.get(tabId);
  if (last && Date.now() - last < 1000) return;
  lastRedirect.set(tabId, Date.now());

  chrome.tabs.update(tabId, { url: `${BLOCKED_PAGE}?url=${encodeURIComponent(url)}` }).catch(() => {});
}

async function checkTab(tabId, url) {
  blockIfNeeded(tabId, url, await loadLists());
}

async function checkAllTabs() {
  const [lists, tabs] = await Promise.all([loadLists(), chrome.tabs.query({})]);
  for (const tab of tabs) blockIfNeeded(tab.id, tab.url, lists);
}

// Una alarma cada minuto en punto, para cerrar las pestañas abiertas justo cuando empieza una franja.
function startTicking() {
  const next = new Date();
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);
  chrome.alarms.create('tick', { when: next.getTime(), periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  startTicking();
  checkAllTabs();
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => {
  startTicking();
  checkAllTabs();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'tick') checkAllTabs();
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.lists) checkAllTabs();
});

chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) checkTab(tabId, url);
});

chrome.tabs.onUpdated.addListener((tabId, { url }) => {
  if (url) checkTab(tabId, url);
});

chrome.tabs.onRemoved.addListener(tabId => lastRedirect.delete(tabId));
