/**
 * Side panel controller: wires speech, Jev, the recipe tab and timers to the UI.
 * All decision logic lives in ../lib and is unit-tested there.
 */

import { ingredientsForStep, interpret } from '../lib/assistant.js';
import { clock, speakDuration } from '../lib/durations.js';
import { JevError, createJevClient } from '../lib/jev.js';
import { extractRecipe, highlightStep } from '../lib/page.js';
import { createTranscriptQueue } from '../lib/queue.js';
import { createSpeaker } from '../lib/speaker.js';
import { createListener } from '../lib/speech.js';
import { Timers } from '../lib/timers.js';

const $ = (id) => document.getElementById(id);
const MAX_ACTIVITY = 30;
const STOP_WORDS = /\b(stop|quiet|shut up|pause)\b/i;

// ---------------------------------------------------------------------------
// Settings

let apiKey = '';
const jev = createJevClient({ getKey: () => apiKey });
const speaker = createSpeaker({ enabled: () => $('read-aloud').checked });

const settings = await chrome.storage.local.get(['apiKey', 'readAloud']);
apiKey = settings.apiKey ?? '';
$('api-key').value = apiKey;
$('read-aloud').checked = settings.readAloud !== false;
if (!apiKey) toggleSettings(true);

$('settings-toggle').addEventListener('click', () => toggleSettings());
$('read-aloud').addEventListener('change', (e) => chrome.storage.local.set({ readAloud: e.target.checked }));
$('key-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  apiKey = $('api-key').value.trim();
  await chrome.storage.local.set({ apiKey });
  setKeyStatus('Checking key…');
  try {
    await jev.evaluate({
      state: 'ping',
      questions: { ok: { type: 'boolean', instructions: 'Is this a test message?' } },
    });
    setKeyStatus('Key saved and working.', 'ok');
  } catch (error) {
    setKeyStatus(error.message, 'error');
  }
});

function toggleSettings(open = $('settings').hidden) {
  $('settings').hidden = !open;
  $('settings-toggle').setAttribute('aria-expanded', String(open));
}

function setKeyStatus(text, tone) {
  const status = $('key-status');
  status.textContent = text;
  status.className = tone ? `hint status-${tone}` : 'hint';
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
  const found = await runInTab(tab.id, extractRecipe).catch(() => null); // chrome:// pages can't be scripted
  // Keep the current recipe while the cook glances at another tab.
  if (!found) return;
  recipe = found;
  recipeTabId = tab.id;
  recipeUrl = tab.url;
  showStep(0, { announce: false });
}

chrome.tabs.onActivated.addListener(loadRecipeFromActiveTab);
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
  $('ingredients').hidden = !recipe?.ingredients.length;
  if (!recipe) return;

  $('title').textContent = recipe.title;
  $('step-count').textContent = `Step ${step + 1} of ${recipe.steps.length}`;
  $('step-text').textContent = recipe.steps[step];
  $('prev').disabled = step === 0;
  $('next').textContent = step === recipe.steps.length - 1 ? 'Finish' : 'Next step';
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

$('prev').addEventListener('click', () => showStep(step - 1));
$('next').addEventListener('click', () => showStep(step + 1));

async function runInTab(tabId, func, args = []) {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return injection?.result;
}

// ---------------------------------------------------------------------------
// Timers

const timers = new Timers();

function startTimer(label, seconds) {
  timers.add(label, seconds);
  renderTimers();
  answer(`Timer set for ${speakDuration(seconds)}.`);
}

function renderTimers() {
  $('timers').replaceChildren(
    ...timers.list.map((timer) => {
      const row = document.createElement('div');
      row.className = timer.finished ? 'timer finished' : 'timer';

      const label = Object.assign(document.createElement('span'), {
        className: 'timer-label',
        textContent: timer.label,
      });
      const time = Object.assign(document.createElement('span'), {
        className: 'timer-time',
        textContent: timer.finished ? 'Done' : clock(timers.secondsLeft(timer)),
      });
      const remove = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'icon-button',
        textContent: '✕',
      });
      remove.setAttribute('aria-label', `Remove ${timer.label} timer`);
      remove.addEventListener('click', () => {
        timers.remove(timer.id);
        renderTimers();
      });

      row.append(label, time, remove);
      return row;
    }),
  );
}

setInterval(() => {
  for (const timer of timers.collectFinished()) {
    chime();
    answer(`${timer.label} timer is done.`);
  }
  if (timers.list.length) renderTimers();
}, 500);

function chime() {
  const audio = new AudioContext();
  for (const at of [0, 0.35, 0.7]) {
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = 880;
    gain.gain.value = 0.2;
    tone.connect(gain).connect(audio.destination);
    tone.start(audio.currentTime + at);
    tone.stop(audio.currentTime + at + 0.2);
  }
}

// ---------------------------------------------------------------------------
// Commands

const handled = new Set();
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
  if (handled.has(id)) return;
  if (!recipe) {
    if (final) answer("I don't see a recipe on this tab. Open a recipe page first.");
    return;
  }

  const started = performance.now();
  let intent;
  try {
    intent = await interpret(jev, { transcript: text, final, recipe, step });
  } catch (error) {
    // A partial is speculative: only a final transcript is worth an error line.
    if (final) logActivity(text, error instanceof JevError ? error.message : 'Something went wrong. Try again.', true);
    return;
  }
  if (!intent || handled.has(id)) return;
  handled.add(id);

  const ms = Math.round(performance.now() - started);
  currentEntry = logActivity(text, `${describe(intent)} in ${ms} ms${final ? '' : ', before you finished'}`);
  try {
    await perform(intent);
  } finally {
    currentEntry = null;
  }
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
    case 'goto':
      return intent.step === null ? answer('Which step?') : showStep(intent.step);
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
        logActivity(null, error.message, true);
      }
      return;
    }
    case 'timer':
      return intent.time
        ? startTimer(`Step ${step + 1}: ${intent.time.label}`, intent.time.seconds)
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
      renderTimers();
      return answer(cancelled ? `Cancelled the ${cancelled.label} timer.` : 'No timers to cancel.');
    }
    case 'stop_talking':
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
  while ($('activity').children.length > MAX_ACTIVITY) $('activity').lastChild.remove();
  return item;
}

const queue = createTranscriptQueue(handle);

let typedCount = 0;
$('command-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('command').value.trim();
  if (!text) return;
  queue.push({ text, final: true, id: `typed:${typedCount++}` });
  $('command').value = '';
});

// ---------------------------------------------------------------------------
// Microphone

const listener = createListener({
  onTranscript(transcript) {
    // While we talk, the mic mostly hears us: only a local "stop" gets through (no Jev call).
    if (speaker.speaking) {
      if (STOP_WORDS.test(transcript.text)) speaker.cancel();
      return;
    }
    $('heard').textContent = transcript.text;
    queue.push(transcript);
  },
  onError({ code, message }) {
    if (code === 'not-allowed') {
      chrome.tabs.create({ url: chrome.runtime.getURL('permission/permission.html') });
      logActivity(null, `${message} Allow it in the tab that just opened, then start listening again.`, true);
      return;
    }
    logActivity(null, message, true);
  },
  onStatus({ listening, mode }) {
    $('mic').setAttribute('aria-pressed', String(listening));
    $('mic-label').textContent = listening ? 'Listening' : 'Start listening';
    $('heard').textContent = listening
      ? `Listening (${mode === 'on-device' ? 'on this device' : 'cloud'} speech recognition)`
      : '';
  },
  onNotice(message) {
    $('heard').textContent = message;
  },
});

$('mic').addEventListener('click', () => (listener.listening ? listener.stop() : listener.start()));

render();
