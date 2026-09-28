/**
 * Side panel controller: wires speech, Jev, the recipe tab and timers to the UI.
 * All decision logic lives in ../lib and is unit-tested there.
 */

import { ingredientsForStep, interpret } from '../lib/assistant.js';
import { clock, durations, speakDuration } from '../lib/durations.js';
import { getConnection, mountConnection } from '../lib/connection.js';
import { JevError, createJevClient } from '../lib/jev.js';
import { extractRecipe, highlightStep } from '../lib/page.js';
import { createTranscriptQueue } from '../lib/queue.js';
import { createSpeaker } from '../lib/speaker.js';
import { createListener } from '../lib/speech.js';
import { Timers } from '../lib/timers.js';

const $ = (id) => document.getElementById(id);
const MAX_ACTIVITY = 30;
const STOP_WORDS = /\b(stop|quiet|shut up|pause)\b/i;
const LONG_STEP = 180; // characters; longer steps drop a size so they fit without scrolling

// ---------------------------------------------------------------------------
// Settings

const jev = createJevClient({
  getKey: async () => (await getConnection()).apiKey,
  getProvider: async () => (await getConnection()).provider,
});
const speaker = createSpeaker({ enabled: () => $('read-aloud').checked });

const settings = await chrome.storage.local.get('readAloud');
$('read-aloud').checked = settings.readAloud !== false;
await mountConnection($('connection'), $('open-settings'), (connected) => {
  if (!connected) toggleSettings(true);
});

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
  $('dock').hidden = !recipe;
  $('activity-section').hidden = !recipe;
  $('ingredients').hidden = !recipe?.ingredients.length;
  if (!recipe) return;

  $('title').textContent = recipe.title;
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
      button.addEventListener('click', () => startTimer(`Step ${step + 1}: ${time.label}`, time.seconds));
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

function startTimer(label, seconds) {
  timers.add(label, seconds);
  renderTimers();
  answer(`Timer set for ${speakDuration(seconds)}.`);
}

function renderTimers() {
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
        renderTimers();
      });
      return row;
    }),
  );
}

/** "Stop" or "cancel the timer" silences finished timers. */
function dismissFinishedTimers() {
  if (timers.dismissFinished().length) renderTimers();
}

setInterval(() => {
  for (const timer of timers.collectFinished()) answer(`${timer.label} timer is done.`);
  if (timers.shouldChime()) chime();
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
      if (STOP_WORDS.test(transcript.text)) {
        speaker.cancel();
        dismissFinishedTimers();
      }
      return;
    }
    showHeard(transcript.text, 'live');
    queue.push(transcript);
  },
  onError({ code, message }) {
    if (code === 'not-allowed') {
      chrome.tabs.create({ url: chrome.runtime.getURL('permission/permission.html') });
      $('mic').classList.add('blocked');
      showHeard(`${message} Allow it in the tab that just opened, then start listening again.`, 'error');
      return;
    }
    logActivity(null, message, true);
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

$('mic').addEventListener('click', () => (listener.listening ? listener.stop() : listener.start()));

render();
