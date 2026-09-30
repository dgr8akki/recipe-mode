# Contributing

Thanks for looking at Recipe Mode. A few things that are easy to miss.

## Before you open a pull request

- `npm run check` has to pass. It runs ESLint, Prettier and the unit tests, and takes about a second.
- There is no build step. Chrome loads `src/` as-is, so everything in it has to be plain ES modules that work in the browser without bundling.
- Behaviour belongs in `src/lib/` with a unit test next to it in `test/`. `src/panel/panel.js` should only wire Chrome APIs and the DOM to those modules.
- Unit tests fake Jev with `fakeJev()` from `test/helpers.js` and use jsdom for the injected page functions. They must not touch the network.

## Voice recognition changes

If you touch `ACTIONS`, the question wording or `THRESHOLDS` in `src/lib/assistant.js`, run `npm run eval` as well. It needs `TYPESAFE_API_KEY` or `AI_GATEWAY_API_KEY` in `.env` and calls the real model, so it is not part of `npm run check`. Keep it at 100%, and add a case for any new phrase you expect to work. TypeSafe answers bursts with 429 and a `Retry-After`; the runner waits and retries, so a 429 on its own is not a failure.

Jev is only ever asked to choose from a list the extension built (actions, step numbers, ingredient lines, times found by `durations.js`). Do not add a question that expects it to write free text, a number or a URL.

Partial transcripts are guesses. Only actions in `EARLY_OK` may fire before the final transcript, and never an action that takes an argument.

## Permissions

Adding or removing a permission changes what the store shows users, so do it in one change: `src/manifest.json`, the permission table in `README.md`, `PRIVACY.md`, and the expected list in `test/manifest.test.js`.

## Releasing

1. Bump `version` in `package.json` and `src/manifest.json`. A test fails if they differ.
2. Move the `Unreleased` notes in `CHANGELOG.md` under the new version with today's date.
3. `npm run check && npm run eval && npm run package`.
4. Upload `dist/recipe-mode-<version>.zip` to the Chrome Web Store and attach it to a GitHub release tagged `v<version>`.
