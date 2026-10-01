# Changelog

Release notes for Recipe Mode, newest at the top. Headings are the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ones; version numbers are [semver](https://semver.org/), so 1.x.0 means the panel can do something new and 1.x.y means it does the same things with fewer bugs.

## [1.3.0] - 2026-10-01

### Added

- **Show** lets you check the key you just pasted before connecting it; closing the form hides it again.
- A "Thinking…" line appears the moment a command is sent and turns into the outcome; the recording dot breathes while a request is in flight (not under reduced motion).
- Settings has a **Try a sample recipe** button that opens a bundled lemon drizzle cake page, so the panel has something to read straight after install.

### Changed

- Listed as "Recipe Mode: hands-free cooking", with a summary that says what it is and gives two real commands.
- The panel's lines say what to do next. "For how long?" is now "How long? Say 'set a timer for 12 minutes'.", a missing ingredient points you at "what are the ingredients", and a rate limit says the buttons still work and when to try again instead of "Something went wrong." The log of commands is headed "What you asked", and the listening line reads "Listening (on-device)" or "Listening (cloud)".
- The panel's settings drawer says where your words and the recipe's steps and ingredients go: the host of the provider you picked, and nowhere else.
- The settings page is flatter: it opens on the heading and the form, so the connection card is on screen in a short window. The copy says commands run on your own key, a whole dinner's worth costs under a cent, and the step buttons and timers need no key. The line about where the key is kept and sent now sits at the top of the form, so you read it before saving a key.
- The microphone page is headed "Let Recipe Mode hear you" and says why the prompt is on its own page and what happens to the audio.
- Timers set by saying a time read "Your timer: 12 minutes"; only a step's own time is labelled "Step 6: …".
- The panel scrolls rather than hiding its controls when they do not fit (200 % zoom, a short window, several timers): the dock and timer rail cap their height, and the send button for typed commands is visible at every width.
- Every spoken word used to carry the whole recipe to Jev. The step question now offers the ten steps either side of the current one, ingredients stop at 40, and partial phrases wait 150 ms to settle before one is sent.
- The settings page, connection row, permission page and Jev client are copies of one shared source (see SHARED.md). While a key check runs the field is read-only and the button shows it is busy; setup links say they open in a new tab; a rejected key's error clears as you type.
- With no key saved, the panel used to force its settings drawer open and stop at "Connect Jev". Following the recipe, Back and Next, step timers, the ingredient list and reading aloud work without one; the microphone button reads "Connect Jev for voice" and the command box says what needs a key.
- Timers survive the side panel closing. They live in session storage with a Chrome alarm each; when the panel is closed a finished timer shows a notification (click it to dismiss), and when it is open the panel chimes and speaks as before. Needs the `alarms` and `notifications` permissions.

### Fixed

- A 429 from the provider used to come back as "Key works." The settings page now saves the key (a rate limit means it was checked) and says the provider is busy.
- The panel returns to "Open a recipe to start" when the recipe tab is closed, instead of staying on a step nobody can see.
- A command said while Recipe Mode is talking is kept and run when it stops, with "Wait for me to finish, or say \"stop\"" shown meanwhile; before, it was dropped without a trace.
- If the browser has no speech voice, read-aloud is unticked and says so; a failed readout frees the microphone at once instead of muting it for the length of the text.
- If speech recognition cannot restart after Chrome ends a session, the panel says "Listening stopped. Tap the microphone to start again." instead of pretending to listen.
- "Step NaN of 5" is gone: a step choice outside the recipe is ignored, and unanswered questions read as "not for us".
- Light-mode borders on inputs and tiles, placeholder text and the command field's focus ring all pass their contrast thresholds; the settings section is a named landmark; the settings page keeps every element inside a landmark.
- Highlighting a step reads each element's text once instead of forcing layout for every paragraph on the page.
- A `HowToSection` without steps in the JSON-LD used to appear as a step named after the section; it is skipped.
- The privacy policy, README and the panel's empty state now say plainly that the open panel checks each page you view for a recipe, locally, and that requests go out per spoken phrase. The panel also skips `chrome://`, `file://` and other extensions' pages up front instead of trying to inject into them.
- The timer bell shares one AudioContext and closes it after the beeps. Before, every chime opened a new one and left it running, so a ringing timer piled up dozens of live audio contexts.
- Closing the side panel, or moving it to another recipe, clears the red step outline from the page instead of leaving the last step boxed.
- The timer rail stopped being a live region and each countdown is a `role="timer"`, so screen readers are not told the remaining time twice a second. Starts and finishes are still announced once, in the activity log.
- The words-heard line under the microphone gave up its live region: screen readers had been re-reading the growing transcript on every word and every "Listening" status. Commands and their outcome are still announced once, from the activity log.
- Red primary buttons (Connect, Next step) use a slightly deeper red in light mode so their white labels pass 4.5:1. The ruler, recording dot and focus ring keep the original red.
- On the settings page, focus moves to Test after connecting a key and to Replace after cancelling, rather than falling back to the top of the page once the form goes away.
- An empty, non-JSON or incomplete 200 from the provider used to get a key saved as "Key works." The client rejects any reply that does not answer every question, the settings page also checks the test answer is one of the two it offered, and failed checks are logged to the console with their cause.
- Offline, the panel used to show "Something went wrong." and say nothing, while the settings page printed "Failed to fetch" and blamed the key. The panel now names the host it could not reach and speaks every error for a final command, and the settings page leaves the key field alone for a network problem.
- The recording dot's pulse now stops for people who ask for reduced motion; a more specific rule had kept it going.
- When a readout fails, the activity log says so once instead of once per sentence.
- In the dark theme, form controls no longer flash light before the stylesheet loads.
- On Chrome 116–139 the background worker died at start-up because `storage.local` refuses `setAccessLevel` there, so the settings page never opened after install and `chrome://extensions` showed an error. The call is guarded.

## [1.2.0] - 2026-09-28

### Changed

- New design: black and white with one red, bigger type, and a dark theme. The Archivo typeface is bundled, so nothing loads from the network.
- The current step is much bigger. The progress bar reads like a ruler: done, now and upcoming steps differ in shape as well as colour.
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

- Settings now opens by itself after install and asks where Jev should run: at TypeSafe with a key from their console, or through Vercel AI Gateway. Pick one and the page swaps in that provider's own setup steps and its own line about where your words go.
- Once saved, only the first and last four characters of the key are visible. Test, Replace and Remove sit beside it.
- The live check picks TypeSafe when `TYPESAFE_API_KEY` is set and Vercel otherwise.

### Changed

- The key field left the side panel. Once a key is saved the panel just says which provider it is "Connected via …" and offers Change; before that it offers Connect Jev.
- Calling api.typesafe.ai needed nothing added to the manifest: the recipe-reading permission already reaches every host. A saved Vercel key goes on working until you replace it.

## [1.0.0] - 2026-09-25

### Added

- Side panel that reads the recipe on the current tab (schema.org JSON-LD, with a heading-based fallback).
- Voice and typed commands: next, back, repeat, start over, go to a step by number or description, ingredient amounts, ingredients for the current step, the full ingredient list.
- Timers that use the current step's cooking time, a time you say, or the right one of several times in a step. Timers chime and announce when done.
- Word-by-word recognition that acts on simple commands before you finish speaking.
- Spoken answers, also shown in the activity log, with "stop" working mid-sentence.
- From Chrome 139, speech is turned into text on your own machine when Chrome can do it there.
- Current step highlighted and scrolled into view on the recipe page.
- Saving a key tries it first. A rejected key, a spent budget or a rate limit each gets its own plain message.

[1.3.0]: https://github.com/dgr8akki/recipe-mode/releases/tag/v1.3.0
[1.2.0]: https://github.com/dgr8akki/recipe-mode/releases/tag/v1.2.0
[1.1.0]: https://github.com/dgr8akki/recipe-mode/releases/tag/v1.1.0
[1.0.0]: https://github.com/dgr8akki/recipe-mode/releases/tag/v1.0.0
