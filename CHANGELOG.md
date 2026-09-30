# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Settings has a **Try a sample recipe** button that opens a bundled lemon drizzle cake page, so the panel has something to read straight after install.

### Changed

- The panel no longer opens its settings drawer and stops at "Connect Jev" when there is no key. Following the recipe, Back and Next, step timers, the ingredient list and reading aloud work without one; the microphone button reads "Connect Jev for voice" and the command box says what needs a key.
- Timers no longer die with the side panel. They are kept in session storage with a Chrome alarm each; when the panel is closed a finished timer shows a notification (click it to dismiss), and when it is open the panel chimes and speaks as before. Needs the `alarms` and `notifications` permissions.

### Fixed

- The privacy policy, README and the panel's empty state now say plainly that the open panel checks each page you view for a recipe, locally, and that requests go out per spoken phrase. The panel also skips `chrome://`, `file://` and other extensions' pages up front instead of trying to inject into them.
- The timer bell no longer opens a new AudioContext on every chime and leaves it running; a ringing timer used to pile up dozens of live audio contexts. One context is shared and closed after the beeps.
- Closing the side panel, or moving it to another recipe, clears the red step outline from the page instead of leaving the last step boxed.
- Screen readers no longer hear the timer countdown twice a second: the timer rail is not a live region any more and each countdown is a `role="timer"`. Timer starts and finishes are still announced once, in the activity log.
- The line under the microphone that shows the words being heard is no longer a live region, so screen readers do not re-read the growing transcript on every word or hear each "Listening" status line. Commands and their outcome are still announced once, from the activity log.
- Red primary buttons (Connect, Next step) use a slightly deeper red in light mode so their white labels pass 4.5:1. The ruler, recording dot and focus ring keep the original red.
- On the settings page, focus moves to Test after connecting a key and to Replace after cancelling, instead of being dropped on the page body when the form disappears.
- A provider answering 200 with an empty, non-JSON or incomplete body no longer gets a key saved as "Key works." The client rejects any reply that does not answer every question, the settings page also checks the test answer is one of the two it offered, and failed checks are logged to the console with their cause.
- Going offline no longer shows "Failed to fetch" or a silent "Something went wrong." The panel says which host it could not reach and speaks every error for a final command, and the settings page stops marking the key field invalid for a network problem.
- The background worker no longer crashes on Chrome 116–139, where `storage.local` refuses `setAccessLevel`. On those versions the settings page did not open after install and the extension showed an error in `chrome://extensions`.

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
