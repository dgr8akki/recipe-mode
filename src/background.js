import { alarmName, createTimerStore, dismissFromNotification, finishFromAlarm } from './lib/timer-store.js';

// Opens the side panel from the toolbar icon.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Guarded because Chrome before 140 refuses setAccessLevel on storage.local, which would kill the
// worker before the listener below registers. Recipe Mode has no content scripts, so nothing is lost.
try {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })?.catch?.(() => {});
} catch {
  // Chrome < 140: no setAccessLevel on storage.local.
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

// Kitchen timers outlive the panel: the panel keeps them in session storage with an alarm each,
// and this is what fires when the panel is not around to chime.
const timerStore = createTimerStore({ storage: chrome.storage.session, alarms: chrome.alarms });

chrome.alarms.onAlarm.addListener(async ({ name }) => {
  const timer = await finishFromAlarm(timerStore, name);
  if (!timer) return;
  // An open panel sees the change in storage and chimes and speaks itself.
  const panels = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] });
  if (panels.length) return;
  chrome.notifications.create(alarmName(timer.id), {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: 'Recipe Mode',
    message: `${timer.label} is done`,
    requireInteraction: true,
  });
});

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  await dismissFromNotification(timerStore, id);
});
