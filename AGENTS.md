# AGENTS.md

Guidance for AI coding agents (and humans) working on Recipe Mode.

## What this is

A Manifest V3 Chrome extension. A side panel reads the recipe on the current tab and lets the cook control it by voice. Intent recognition uses Jev (TypeSafe's System One model) through Vercel AI Gateway's `/v1/evaluate` endpoint.

## Commands

```sh
npm install
npm run check      # must pass before every commit: lint + format check + unit tests
npm test           # unit tests only (offline, ~1s)
npm run eval       # live Jev evaluation; needs AI_GATEWAY_API_KEY in .env; waits out 429s
npm run package    # dist/recipe-mode-<version>.zip
npm run icons      # re-render src/icons from assets/icon.svg (needs Google Chrome)
```

There is no build step. `src/` is loaded as-is by Chrome, so it must stay plain ES modules that run in the browser without bundling.

## Architecture

| Path                   | Responsibility                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `src/lib/assistant.js` | Builds Jev questions, turns answers into an `Intent`. All decision thresholds live here. |
| `src/lib/durations.js` | Deterministic cooking-time parser. Jev never produces numbers.                           |
| `src/lib/jev.js`       | HTTP client: one 5xx retry, pauses on 429 using `Retry-After`, user-facing errors.       |
| `src/lib/page.js`      | Functions injected with `chrome.scripting.executeScript`.                                |
| `src/lib/queue.js`     | One Jev request in flight; newest partial transcript wins, finals are never dropped.     |
| `src/lib/speech.js`    | Speech recognition wrapper (on-device first, word-by-word partials).                     |
| `src/lib/speaker.js`   | Text-to-speech; exposes `speaking` so the mic ignores the panel's own voice.             |
| `src/lib/timers.js`    | Timer state with an injectable clock.                                                    |
| `src/panel/panel.js`   | Wiring only: Chrome APIs, DOM, and calls into `lib/`. Keep logic out of here.            |

## Rules

1. **Jev picks, it never writes.** Every value the extension acts on must come from a list our code built (actions, steps, ingredient lines, parsed times). Do not add questions that expect Jev to produce free text, numbers or URLs.
2. **Injected functions are self-contained.** Anything in `src/lib/page.js` is serialised by Chrome on its own: no imports, no closures over module scope, no helpers defined outside the function.
3. **Keep `panel.js` thin.** New behaviour goes into a `lib/` module with unit tests; the panel only wires it up.
4. **Partial transcripts are speculative.** Only act early on actions in `EARLY_OK`, and never on actions that take an argument. Errors from partials are not shown to the user.
5. **Permissions are part of the product.** Don't add a permission without updating the README permission table, `PRIVACY.md` and `test/manifest.test.js`.
6. **Copy is plain and specific.** Sentence case, active voice, no exclamation marks in errors. Errors say what happened and what to do.

## Testing

- Unit tests fake Jev with `fakeJev()` from `test/helpers.js` and use jsdom via `installDom()` for page functions. They must not touch the network.
- When you change `ACTIONS`, question wording or `THRESHOLDS`, run `npm run eval` and keep it at 100%. Add an eval case for any new phrase you expect to work.
- TypeSafe rate-limits bursts (HTTP 429 with `Retry-After`). The eval runner waits and retries; a 429 is not a test failure.

## Releasing

1. Bump `version` in both `package.json` and `src/manifest.json` (a test enforces they match).
2. Add an entry to `CHANGELOG.md`.
3. `npm run check && npm run eval && npm run package`, then upload `dist/*.zip` to the Chrome Web Store and attach it to a GitHub release.
