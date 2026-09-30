/**
 * Side panel controller: wires speech, Jev, the recipe tab and timers to the UI.
 * All decision logic lives in ../lib and is unit-tested there.
 */

import { ingredientsForStep, interpret } from '../lib/assistant.js';
import { createChime } from '../lib/chime.js';
import { clock, durations, speakDuration } from '../lib/durations.js';
import { getConnection, mountConnection } from '../lib/connection.js';
import { JevError, createJevClient, sessionPauseStore } from '../lib/jev.js';
import { canScan, clearHighlight, extractRecipe, highlightStep } from '../lib/page.js';
import { createTranscriptQueue } from '../lib/queue.js';
import { createRecentSet } from '../lib/recent.js';
import { createSpeaker } from '../lib/speaker.js';
import { createListener } from '../lib/speech.js';
import { createTimerStore } from '../lib/timer-store.js';
import { Timers, timerLabel } from '../lib/timers.js';

const $ = (id) => document.getElementById(id);
const MAX_ACTIVITY = 30;
const STOP_WORDS = /\b(stop|quiet|shut up|pause)\b/i;
const LONG_STEP = 180; // characters; longer steps drop a size so they fit without scrolling
const PARTIAL_DEBOUNCE_MS = 150; // recognition emits a partial per word; wait for the burst to settle

// ---------------------------------------------------------------------------
// Settings

const jev = createJevClient({
  getKey: async () => (await getConnection()).apiKey,
  getProvider: async () => (await getConnection()).provider,
  pauseStore: sessionPauseStore(chrome.storage.session), // a 429 backoff outlives this panel
});
/** A final transcript heard while Recipe Mode was talking; runs once it has finished (see onIdle). */
let heldTranscript = null;
const speaker = createSpeaker({
  enabled: () => $('read-aloud').checked,
  onError: (message) => logActivity(null, message, true),
  onVoices: (available) => {
    if (!available) readAloudUnavailable();
  },
  onIdle() {
    clearHoldNotice();
    if (!heldTranscript) return;
    const transcript = heldTranscript;
    heldTranscript = null;
    queue.push(transcript);
  },
});

/** The "wait for me" line stays only while there is something to wait for. */
let holdNoticeShown = false;
function clearHoldNotice() {
  if (!holdNoticeShown) return;
  holdNoticeShown = false;
  showHeard('');
}

function readAloudUnavailable() {
  if (!$('read-aloud').checked) return;
  $('read-aloud').checked = false;
  logActivity(null, "Read aloud isn't available in this browser: no speech voices are installed.", true);
}
// Chrome can report an empty voice list for a moment after load, so give it a little time before saying so.
if (!speaker.available) setTimeout(() => !speaker.available && readAloudUnavailable(), 3000);

const settings = await chrome.storage.local.get('readAloud');
$('read-aloud').checked = settings.readAloud !== false;

/** Whether a Jev key is saved. Only voice and typed commands need one; the rest of the panel works without. */
let connected = false;

$('settings-toggle').addEventListener('click', () => toggleSettings());
$('read-aloud').addEventListener('change', (e) => chrome.storage.local.set({ readAloud: e.target.checked }));

function toggleSettings(open = $('settings').hidden) {
  $('settings').hidden = !open;
  $('settings-toggle').setAttribute('aria-expanded', String(open));
}

// ---------------------------------------------------------------------------
// Recipe

/** @type {import('../lib/assistant.js').Recipe | null} */
let recipe = null;
let step = 0;
let recipeTabId = null;
let recipeUrl = null;

async function loadRecipeFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || (tab.id === recipeTabId && tab.url === recipeUrl)) return;
  if (!canScan(tab.url, chrome.runtime.getURL(''))) return;
  const found = await runInTab(tab.id, extractRecipe).catch(() => null); // the tab may have navigated away
  // Keep the current recipe while the cook glances at another tab.
  if (!found) return;
  if (recipeTabId !== null && recipeTabId !== tab.id) clearHighlightIn(recipeTabId);
  recipe = found;
  recipeTabId = tab.id;
  recipeUrl = tab.url;
  showStep(0, { announce: false });
}

/** Best effort: the tab may be gone. */
function clearHighlightIn(tabId) {
  runInTab(tabId, clearHighlight).catch(() => {});
}

// Closing the panel must not leave a red box on the recipe. pagehide is the last chance to ask the tab.
window.addEventListener('pagehide', () => {
  if (recipeTabId !== null) clearHighlightIn(recipeTabId);
});

chrome.tabs.onActivated.addListener(loadRecipeFromActiveTab);
// The recipe went with its tab: back to the empty state rather than a step nobody can see.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== recipeTabId) return;
  recipe = null;
  recipeTabId = null;
  recipeUrl = null;
  step = 0;
  render();
});
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (info.status === 'complete' && tab.active) loadRecipeFromActiveTab();
});
loadRecipeFromActiveTab();

function showStep(index, { announce = true } = {}) {
  if (!recipe) return answer("I don't see a recipe yet. Open a recipe page first.");
  if (index < 0) return answer("You're on the first step.");
  if (index >= recipe.steps.length) return answer('That was the last step. Enjoy your meal.');
  step = index;
  render();
  runInTab(recipeTabId, highlightStep, [recipe.steps[step]]).catch(() => {});
  if (announce) speaker.say(`Step ${step + 1}. ${recipe.steps[step]}`); // already on screen
}

function render() {
  $('empty').hidden = Boolean(recipe);
  $('recipe').hidden = !recipe;
  $('dock').hidden = !recipe;
  $('activity-section').hidden = !recipe && !$('activity').children.length; // replies after the tab closed still show
  $('ingredients').hidden = !recipe?.ingredients.length;
  if (!recipe) return;

  $('title').textContent = recipe.title;
  $('title').title = recipe.title; // the heading clamps at two lines
  $('step-count').textContent = `Step ${step + 1} of ${recipe.steps.length}`;
  $('step-text').textContent = recipe.steps[step];
  $('step-text').classList.toggle('long', recipe.steps[step].length > LONG_STEP);
  $('prev').disabled = step === 0;
  const last = step === recipe.steps.length - 1;
  $('next-label').textContent = last ? 'Finish' : 'Next step';
  $('next').classList.toggle('last', last);
  // One tap per cooking time in the step: the same timer "set a timer" would start.
  $('step-timers').replaceChildren(
    ...durations(recipe.steps[step]).map((time) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = STOPWATCH;
      button.append(`Start the ${time.label} timer`);
      button.addEventListener('click', () => startTimer(timerLabel(time, { step, spoken: false }), time.seconds));
      return button;
    }),
  );
  $('up-next').hidden = last;
  $('up-next-label').textContent = `Up next · Step ${step + 2}`;
  $('up-next-text').textContent = recipe.steps[step + 1] ?? '';
  $('progress').replaceChildren(
    ...recipe.steps.map((_, i) => {
      const li = document.createElement('li');
      li.className = i < step ? 'done' : i === step ? 'current' : '';
      return li;
    }),
  );
  $('ingredients-summary').textContent = `Ingredients (${recipe.ingredients.length})`;
  $('ingredient-list').replaceChildren(
    ...recipe.ingredients.map((line) => Object.assign(document.createElement('li'), { textContent: line })),
  );
}

const STOPWATCH =
  '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/></svg>';

$('prev').addEventListener('click', () => showStep(step - 1));
$('next').addEventListener('click', () => showStep(step + 1));

async function runInTab(tabId, func, args = []) {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return injection?.result;
}

// ---------------------------------------------------------------------------
// Timers

const timers = new Timers();
// Timers live in session storage with an alarm each, so they keep going when this panel closes;
// the service worker rings them then. Every change here is saved, and changes elsewhere show up.
const timerStore = createTimerStore({ storage: chrome.storage.session, alarms: chrome.alarms });
await timerStore.load(timers);
timerStore.onChange((snapshot) => {
  for (const timer of timers.restore(snapshot)) answer(`${timer.label} timer is done.`);
  renderTimers();
});

function saveTimers() {
  timerStore.save(timers).catch((error) => console.error('Could not save timers', error));
}

function startTimer(label, seconds) {
  timers.add(label, seconds);
  saveTimers();
  renderTimers();
  answer(`Timer set for ${speakDuration(seconds)}.`);
}

function renderTimers() {
  syncTick();
  const finishedFirst = [...timers.list].sort((a, b) => Number(b.finished) - Number(a.finished));
  $('timers').replaceChildren(
    ...finishedFirst.map((timer) => {
      const row = $('timer-template').content.firstElementChild.cloneNode(true);
      row.classList.toggle('finished', timer.finished);
      row.querySelector('.timer-label').textContent = timer.label;
      row.querySelector('.timer-time').textContent = timer.finished ? 'Done' : clock(timers.secondsLeft(timer));
      row.querySelector('.timer-bar').style.setProperty('--left', timers.fractionLeft(timer));
      const remove = row.querySelector('.timer-remove');
      remove.setAttribute('aria-label', `Remove ${timer.label} timer`);
      remove.addEventListener('click', () => {
        timers.remove(timer.id);
        saveTimers();
        renderTimers();
      });
      return row;
    }),
  );
}

/** "Stop" or "cancel the timer" silences finished timers. */
function dismissFinishedTimers() {
  if (!timers.dismissFinished().length) return;
  saveTimers();
  renderTimers();
}

// The tick drives the countdown display; finishing is also noticed here when the panel is open.
// It only runs while there is a timer to show: renderTimers() is called after every change.
let tick = null;
function syncTick() {
  if (timers.list.length && tick === null) tick = setInterval(onTick, 500);
  if (!timers.list.length && tick !== null) tick = clearInterval(tick) ?? null;
}
function onTick() {
  const done = timers.collectFinished();
  for (const timer of done) answer(`${timer.label} timer is done.`);
  if (done.length) saveTimers();
  if (timers.shouldChime()) chime();
  renderTimers();
}

const chime = createChime();

// ---------------------------------------------------------------------------
// Commands

/** Utterance ids already acted on, so a final does not repeat what its partial did. */
const handled = createRecentSet(100);
/** Activity entry of the command being handled; answers are shown under it. */
let currentEntry = null;

/** Speaks an answer and shows it under the command that asked for it. */
function answer(text) {
  speaker.say(text);
  const reply = Object.assign(document.createElement('span'), { className: 'reply', textContent: text });
  if (currentEntry) currentEntry.append(reply);
  else logActivity(null, text);
}

async function handle({ text, final, id }) {
  if (handled.has(id) || !connected) return;
  if (!recipe) {
    if (final) answer("I don't see a recipe on this tab. Open a recipe page first.");
    return;
  }

  const started = performance.now();
  // Something on screen the moment a command is sent; partials stay quiet until they act.
  const pending = final ? logActivity(text, 'Thinking…') : null;
  let intent;
  thinking(+1);
  try {
    intent = await interpret(jev, { transcript: text, final, recipe, step });
  } catch (error) {
    // A partial is speculative: only a final transcript is worth an error line.
    if (final) failed(text, error, pending);
    return;
  } finally {
    thinking(-1);
  }
  if (!intent || handled.has(id)) {
    pending?.remove(); // a partial already did this
    return;
  }
  handled.add(id);

  const ms = Math.round(performance.now() - started);
  currentEntry = pending ?? logActivity(text, '');
  setResult(currentEntry, `${describe(intent)} in ${ms} ms${final ? '' : ', before you finished'}`);
  try {
    await perform(intent);
  } finally {
    currentEntry = null;
  }
}

/** Shows and speaks an error: a cook with floury hands is not looking at the panel. */
function failed(said, error, entry = null) {
  const message = error instanceof JevError ? error.message : 'Something went wrong. Try again.';
  if (!(error instanceof JevError)) console.error(error);
  if (entry) setResult(entry, message, true);
  else logActivity(said, message, true);
  speaker.say(message);
}

/** Requests in flight; while there are any the panel shows it (rec dot pulses, heard line gets an ellipsis). */
let inFlight = 0;
function thinking(delta) {
  inFlight += delta;
  document.body.classList.toggle('thinking', inFlight > 0);
}

async function perform(intent) {
  switch (intent.action) {
    case 'next':
      return showStep(step + 1);
    case 'prev':
      return showStep(step - 1);
    case 'repeat':
      return showStep(step);
    case 'restart':
      return showStep(0);
    case 'goto': {
      const known = Number.isInteger(intent.step) && intent.step >= 0 && intent.step < recipe.steps.length;
      return known ? showStep(intent.step) : answer('Which step?');
    }
    case 'amount':
      return answer(
        intent.ingredient === null ? "I couldn't find that in the ingredients." : recipe.ingredients[intent.ingredient],
      );
    case 'all_ingredients':
      return answer(
        recipe.ingredients.length
          ? `You need: ${recipe.ingredients.join('. ')}.`
          : 'This recipe has no ingredient list.',
      );
    case 'step_ingredients': {
      try {
        const needed = await ingredientsForStep(jev, recipe, step);
        answer(
          needed.length ? `For this step: ${needed.join('. ')}.` : "This step doesn't use any listed ingredients.",
        );
      } catch (error) {
        failed(null, error);
      }
      return;
    }
    case 'timer':
      return intent.time
        ? startTimer(timerLabel(intent.time, { step, spoken: intent.timeSpoken }), intent.time.seconds)
        : answer('For how long?');
    case 'timer_left': {
      const running = timers.running();
      return answer(
        running.length
          ? running.map((t) => `${t.label}, ${speakDuration(timers.secondsLeft(t))} left`).join('. ')
          : 'No timers are running.',
      );
    }
    case 'timer_cancel': {
      const cancelled = timers.removeLatest();
      saveTimers();
      renderTimers();
      if (!cancelled) return answer('No timers to cancel.');
      return answer(`${cancelled.finished ? 'Stopped' : 'Cancelled'} the ${cancelled.label} timer.`);
    }
    case 'stop_talking':
      dismissFinishedTimers();
      return speaker.cancel();
    default:
      return undefined; // "none": the cook wasn't talking to us.
  }
}

function describe(intent) {
  switch (intent.action) {
    case 'goto':
      return intent.step === null ? 'Asked which step' : `Went to step ${intent.step + 1}`;
    case 'amount':
      return 'Read an ingredient';
    case 'timer':
      return intent.time ? `Started a ${intent.time.label} timer` : 'Asked how long';
    case 'none':
      return 'Ignored';
    default:
      return {
        next: 'Next step',
        prev: 'Previous step',
        repeat: 'Repeated the step',
        restart: 'Started over',
        all_ingredients: 'Read all ingredients',
        step_ingredients: 'Listed ingredients for this step',
        timer_left: 'Read time left',
        timer_cancel: 'Cancelled a timer',
        stop_talking: 'Stopped talking',
      }[intent.action];
  }
}

/**
 * @param {string | null} said What the cook said, or null for system messages.
 * @param {string} result
 * @returns {HTMLLIElement}
 */
function logActivity(said, result, isError = false) {
  const item = document.createElement('li');
  if (said) item.append(Object.assign(document.createElement('span'), { className: 'said', textContent: `“${said}”` }));
  item.append(
    Object.assign(document.createElement('span'), { className: isError ? 'error' : 'result', textContent: result }),
  );
  $('activity').prepend(item);
  $('activity-section').hidden = false;
  while ($('activity').children.length > MAX_ACTIVITY) $('activity').lastChild.remove();
  return item;
}

/** Replaces the outcome line of an activity entry, e.g. "Thinking…" with what happened. */
function setResult(item, text, isError = false) {
  const span = item.querySelector('.result, .error');
  span.className = isError ? 'error' : 'result';
  span.textContent = text;
}

const queue = createTranscriptQueue(handle);

let typedCount = 0;
$('command-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('command').value.trim();
  if (!text) return;
  if (!connected) return chrome.runtime.openOptionsPage();
  queue.push({ text, final: true, id: `typed:${typedCount++}` });
  $('command').value = '';
});

// ---------------------------------------------------------------------------
// Microphone

let partialTimer = null;
const listener = createListener({
  onTranscript(transcript) {
    // While we talk, the mic mostly hears us: only a local "stop" gets through (no Jev call).
    // A finished phrase is kept for when we stop talking rather than silently dropped.
    if (speaker.speaking) {
      if (STOP_WORDS.test(transcript.text)) {
        speaker.cancel();
        dismissFinishedTimers();
        clearHoldNotice();
      } else if (transcript.final) {
        heldTranscript = transcript;
        holdNoticeShown = true;
        showHeard('Wait for me to finish, or say "stop".');
      }
      return;
    }
    showHeard(transcript.text, 'live');
    clearTimeout(partialTimer);
    if (transcript.final) queue.push(transcript);
    else partialTimer = setTimeout(() => queue.push(transcript), PARTIAL_DEBOUNCE_MS);
  },
  onError({ code, message }) {
    if (code === 'not-allowed') {
      chrome.tabs.create({ url: chrome.runtime.getURL('permission/permission.html') });
      $('mic').classList.add('blocked');
      showHeard(`${message} Allow it in the tab that just opened, then start listening again.`, 'error');
      return;
    }
    logActivity(null, message, true);
    speaker.say(message); // the cook may not be looking
  },
  onStatus({ listening, mode }) {
    $('mic').setAttribute('aria-pressed', String(listening));
    $('mic-label').textContent = listening ? 'Listening' : 'Start listening';
    if (listening) {
      $('mic').classList.remove('blocked');
      showHeard(`Listening (${mode === 'on-device' ? 'on this device' : 'cloud'} speech recognition)`);
    } else if (!$('mic').classList.contains('blocked')) showHeard('');
  },
  onNotice(message) {
    showHeard(message);
  },
});

/** @param {'live' | 'error'} [tone] live: words heard right now; none: a quiet status line. */
function showHeard(text, tone) {
  $('heard').textContent = text;
  $('heard').className = tone ? `heard ${tone}` : 'heard';
}

$('mic').addEventListener('click', () => {
  if (!connected) return chrome.runtime.openOptionsPage();
  if (listener.listening) listener.stop();
  else listener.start();
});

const TYPED_HINT = $('command').placeholder;
await mountConnection($('connection'), $('open-settings'), {
  primaryClass: 'primary',
  secondaryClass: 'secondary',
  onChange(isConnected) {
    connected = isConnected;
    $('connection').parentElement.classList.toggle('connected', connected);
    if (!connected && listener.listening) listener.stop();
    if (!listener.listening) $('mic-label').textContent = connected ? 'Start listening' : 'Connect Jev for voice';
    $('command').placeholder = connected ? TYPED_HINT : 'Voice and typed commands need Jev · Connect';
  },
});

render();
renderTimers();
