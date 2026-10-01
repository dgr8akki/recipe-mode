<div align="center">

<img src="assets/icon.svg" width="72" height="72" alt="" />

# Recipe Mode

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png" />
  <img src="docs/screenshot-light.png" width="420" alt="Recipe Mode side panel on step 5 of 8 of a lemon drizzle cake: the step's 45-50 mins timer pinned at the top at 45:00, the step in large type with a Start the 45-50 mins timer button, the next step previewed below, and Back, Next step and a Listening microphone bar docked at the bottom." />
</picture>

</div>

Recipe Mode is a hands-free cooking assistant for Chrome. Open a recipe page, open the side panel, and the recipe is there in big type, one step at a time. Say "next", "how much butter?" or "set a timer" and it answers out loud, moves the step, and outlines the step on the page so you can glance at the screen from across the kitchen.

It reads the schema.org recipe data that most recipe sites publish for search engines, so it works on sites it has never seen. Pages that only have an "Ingredients" heading and a "Method" list work too, as long as the page is simple. Cooking times are found by regex, including "1 ½ hours" and "25-30 minutes", and every step that mentions a time gets a button such as "Start the 30 mins timer". If a step says two times, it picks the one you mean.

Commands are understood by Jev, TypeSafe's System One model. Jev does not write text. It picks from lists the extension builds from the page (which action, which step, which ingredient line, which time), so nothing it tells you is made up. Simple commands like "next" act before you have finished the sentence. "Honey, pass the salt" is left alone.

## Install

Recipe Mode is not on the Chrome Web Store yet, so for now it goes in by hand. Grab `recipe-mode-x.y.z.zip` from [Releases](https://github.com/dgr8akki/recipe-mode/releases) (or clone the repo and use its `src/` folder), then in `chrome://extensions` switch Developer mode on and choose Load unpacked. Pinning it from the puzzle-piece menu puts the icon where a floury finger can find it.

Use Google Chrome. Brave ships the speech API without a working backend, so there you can only type commands.

Following a recipe, Back and Next, the step timers, the ingredient list and reading aloud all work straight away, and the settings page that opens on install has a "Try a sample recipe" button. Voice and typed commands go through Jev, so for those you need a key from [TypeSafe](https://console.typesafe.ai/keys) or [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys). Choose one of the two, paste its key and Connect; Recipe Mode tries the key first and only keeps it if it works, and after that the field shows it masked. At TypeSafe's September 2026 price of $0.042 for a million input tokens, asking "how much flour?" costs about one cent per hundred questions. A Vercel key can carry a spend limit if you want a ceiling.

## Cooking with it

Open a recipe, click the Recipe Mode icon, and the panel shows step 1. Back, Next and the timer buttons need nothing else. For voice, press Start listening; the first time, Chrome asks for the microphone in a new tab.

These are the voice commands for cooking it understands. Everything in the table can also be typed into the box under the microphone button.

| Say                                                          | What happens                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| "Next", "go back", "what was that?", "start over"            | Moves between steps and reads the step aloud                   |
| "Go to step 4", "go to the step where I add the eggs"        | Jumps to that step                                             |
| "How much butter?"                                           | Reads the ingredient line, for example "140g butter, softened" |
| "What do I need for this step?", "what are the ingredients?" | Lists the ingredients for this step, or all of them            |
| "Set a timer", "set a timer for 12 minutes"                  | Starts a timer from the step's own time, or the time you say   |
| "How long is left?", "cancel the timer"                      | Reads or cancels timers; a ringing timer is cancelled first    |
| "Stop"                                                       | Stops reading, even mid-sentence, and silences finished timers |

Timers keep running when the panel is closed. Chrome shows a notification when one finishes; with the panel open it chimes and says so.

## When it goes wrong in the kitchen

- Timers survive the panel closing but not the browser closing. With the panel closed, a timer under 30 seconds can ring late, because Chrome does not fire alarms sooner than that.
- While Recipe Mode is talking, a command you say is held until it finishes; only "stop" acts at once. That is how it avoids reacting to its own voice.
- It reads the recipe from the page you open. A recipe inside an embedded video is invisible to it.
- Commands are English only for now.

Things that come up, and what to try:

| Problem                                          | What to try                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| "Open a recipe to start" on a recipe page        | Reload the page. Some sites publish no recipe data, and the heading fallback only copes with simple pages.                                |
| It hears the extractor fan, not you              | Move the laptop or phone mic closer, or type the command. Kitchen noise is the main reason a phrase comes back as "Ignored".              |
| A timer rang late with the panel closed          | Chrome fires alarms at most every 30 seconds. Timers of a minute or more are on time; for shorter ones keep the panel open.               |
| "Jev is busy. Buttons still work; try again in…" | TypeSafe is rate-limiting. Back, Next and the timer buttons keep working; the voice comes back after the wait.                            |
| "Your API key was rejected"                      | Select Change in the panel's settings and connect a new key. A brand-new Vercel account won't answer until a payment card is added to it. |
| Nothing happens when you speak                   | Check that your words appear under the microphone button. If not, allow Chrome in System Settings, Privacy & Security, Microphone.        |
| It stopped listening on its own                  | Chrome ends recognition after long silences; Recipe Mode restarts it. If it says "Listening stopped", tap the microphone once more.       |

## Development

You'll want Node.js 22 or newer. After `npm ci`, the command to know is `npm run check`: ESLint, Prettier and the unit tests, done in about a second, and it has to be green before anything is committed. For the real model there is `npm run live`, which says fifteen kitchen phrases to Jev and waits out any rate limit; it reads its key from `.env`, as either `AI_GATEWAY_API_KEY` or `TYPESAFE_API_KEY`. CI never runs it. `npm run package` builds the upload zip from `src/` after making sure `package.json` and the manifest agree on the version, and `npm run icons` redraws the PNG icons from `assets/icon.svg` in headless Chrome.

There is no build step: Chrome loads `src/` as plain ES modules.

```
src/
├── manifest.json
├── background.js          Opens the side panel; rings timers when the panel is closed
├── theme.css              Colour, type and button tokens shared by every page
├── fonts/                 Archivo (SIL OFL 1.1), bundled so nothing loads from the network
├── panel/                 Side panel UI (HTML, CSS, controller)
├── options/               Settings: where Jev runs and the key for it, plus the sample recipe
├── permission/            One-time microphone permission page
├── demo/                  Sample recipe page, opened from settings
└── lib/
    ├── assistant.js       Builds Jev questions and turns answers into intents
    ├── chime.js           The timer bell, on one shared AudioContext
    ├── durations.js       Finds cooking times in text ("1 ½ hours", "25-30 mins")
    ├── connection.js      "Connected via …" row; opens settings
    ├── jev.js             Talks to Jev at either provider; retries once, backs off when rate-limited
    ├── page.js            Functions injected into the recipe tab
    ├── queue.js           One request in flight; newest partial wins
    ├── recent.js          The last hundred utterance ids, for dedupe
    ├── speaker.js         Reads answers aloud; mutes the mic while talking
    ├── speech.js          Word-by-word speech recognition, on-device first
    ├── timer-store.js     Keeps timers in session storage with an alarm each
    └── timers.js          Kitchen timers
test/                      Unit tests; test/live/ talks to the real model
```

The unit tests fake Jev and use jsdom for the page functions and the panel. They cover time parsing, the intent rules, the Jev client's retry and rate-limit handling, recipe extraction from real-world JSON-LD shapes, the panel controller, the settings page and the manifest. `jev.js`, `connection.js`, `options.js`, `permission.js` and a few test files are copies from [jev-shared](https://github.com/dgr8akki/jev-shared); see [SHARED.md](SHARED.md) before editing them. [CONTRIBUTING.md](CONTRIBUTING.md) covers what to check before a pull request and how a release is cut.

## What it sends, and the permissions it asks for

While the side panel is open, Recipe Mode checks each page you view for a recipe, on your device. Only a recipe's steps and ingredient lines are ever sent, together with your words as you speak them, to whichever provider you connected. With Vercel AI Gateway in the middle, Vercel passes the request on to TypeSafe, where Jev runs. The page's address and title never leave the browser. Audio is transcribed by Chrome (on your device where it can) and never recorded. Details are in [PRIVACY.md](PRIVACY.md).

| Permission                | Why                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `sidePanel`               | Shows the assistant next to the recipe                                                           |
| `scripting`, `<all_urls>` | Reads the recipe on the tab you are viewing and outlines the step                                |
| `storage`                 | Keeps your API key and settings in this browser                                                  |
| `alarms`, `notifications` | Rings a timer and shows a notice when the side panel is closed                                   |
| Microphone                | Lets you talk to it with sticky hands; Chrome turns the sound into words and nothing is recorded |

## License

[MIT](LICENSE) © 2026 Aakash Pahuja. The bundled Archivo font is under the [SIL Open Font License](src/fonts/OFL.txt).
