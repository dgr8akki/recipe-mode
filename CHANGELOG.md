# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-09-28

### Changed

- New look: ink on warm white with one signal red, the Archivo typeface (bundled, no network), square modules and a dark theme for dim kitchens.
- The step is set in large type (27px, 34px in a wide panel, 22px for long steps). The progress bar reads like a ruler: done, now and upcoming steps differ in shape as well as colour.
- Timers moved to a rail at the top of the panel, with a countdown bar. A finished timer becomes a pulsing red band with a bell and chimes every 20 seconds until you dismiss it with ✕, "stop" or "cancel the timer".
- Back, Next, the microphone and the command field are docked at the bottom; only the step, ingredients and activity scroll.
- Redesigned settings and microphone permission pages, with status messages that use an icon as well as colour.
- The step highlight on the recipe page is a 4px red outline that stands out on light and dark sites.
- New icon.

### Added

- A one-tap button under each step that mentions a time, such as **Start the 30 mins timer**.
- **Up next** shows the following step under the current one.

## [1.1.0] - 2026-09-27

### Added

- Choose your Jev provider on a new settings page: TypeSafe directly (key from the TypeSafe console) or Vercel AI Gateway. Setup steps, key link and privacy line follow the choice.
- The settings page opens on install. A saved key is never shown again: it appears masked with Test, Replace and Remove.
- `npm run eval` uses `TYPESAFE_API_KEY` when set, otherwise `AI_GATEWAY_API_KEY`.

### Changed

- The side panel no longer has a key field; it shows "Connected via …" with **Change**, or **Connect Jev** until a key is saved.
- No new permissions: `<all_urls>` already covers `api.typesafe.ai`. Existing installs keep using Vercel until you switch.

## [1.0.0] - 2026-09-25

### Added

- Side panel that reads the recipe on the current tab (schema.org JSON-LD, with a heading-based fallback).
- Voice and typed commands: next, back, repeat, start over, go to a step by number or description, ingredient amounts, ingredients for the current step, the full ingredient list.
- Timers that use the current step's cooking time, a time you say, or the right one of several times in a step. Timers chime and announce when done.
- Word-by-word recognition that acts on simple commands before you finish speaking.
- Spoken answers, also shown in the activity log, with "stop" working mid-sentence.
- On-device speech recognition on Chrome 139 and later.
- Current step highlighted and scrolled into view on the recipe page.
- API key check on save; clear messages for rejected keys, exhausted budgets and rate limits.

[1.2.0]: https://github.com/dgr8akki/recipe-mode/releases/tag/v1.2.0
[1.1.0]: https://github.com/dgr8akki/recipe-mode/releases/tag/v1.1.0
[1.0.0]: https://github.com/dgr8akki/recipe-mode/releases/tag/v1.0.0
