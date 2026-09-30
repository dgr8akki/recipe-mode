<div align="center">

<img src="assets/icon.svg" width="72" height="72" alt="" />

# Recipe Mode

**Cook hands-free on any recipe page.** Say "next", "how much butter?" or "set a timer" while your hands are covered in flour.

[![CI](https://github.com/dgr8akki/recipe-mode/actions/workflows/ci.yml/badge.svg)](https://github.com/dgr8akki/recipe-mode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-ec3013.svg)](LICENSE)
![Manifest V3](https://img.shields.io/badge/manifest-v3-ec3013.svg)
![Chrome 116+](https://img.shields.io/badge/chrome-116%2B-ec3013.svg)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png" />
  <img src="docs/screenshot-light.png" width="360" alt="Recipe Mode side panel on step 6 of 7 of a lemon drizzle cake: a finished 30 minute timer shown as a red Done band, two running timers with countdown bars, the step in large type, and Back, Next step and Start listening controls docked at the bottom." />
</picture>

</div>

## Features

- **Works on any recipe site.** Reads the schema.org recipe data most sites publish for search engines, with a fallback for simple pages.
- **Talk naturally.** "What was that?", "go to the step where I pour it into the tin", "honey, pass the salt" (ignored: that wasn't for you).
- **Answers out loud** and highlights the current step on the page, so you rarely need to look.
- **Smart timers.** "Set a timer" uses the time in the current step, or tap **Start the 30 mins timer** under it. When a step mentions two times, it picks the one you meant. A finished timer turns into a red band at the top and chimes every 20 seconds until you dismiss it.
- **Readable from across the kitchen.** Big type, a ruler-style progress bar, the next step previewed underneath, and big controls docked at the bottom. Light and dark themes.
- **Fast.** Simple commands like "next" act before you finish the sentence.
- **Private by default.** On-device speech recognition where Chrome supports it. No accounts, no analytics.

## How it works

Recipe Mode is built on [Jev](https://typesafe.ai), TypeSafe's System One model. Jev doesn't generate text, it answers typed questions with probabilities, so it **never makes anything up**: every step, ingredient and time the assistant reads to you comes straight from the recipe.

```mermaid
flowchart LR
  A[Speech, word by word] --> B[Transcript queue]
  B --> C{Jev: one call}
  C -->|which action?| D[next, timer, amount, ...]
  C -->|which step?| E[Step list from the page]
  C -->|which ingredient?| F[Ingredient lines from the page]
  D & E & F --> G[Panel acts and speaks]
```

Each spoken phrase becomes one request carrying several questions (action, step, ingredient, and which timer if a step has several). Jev picks from lists that the extension builds from the page. Cooking times are parsed deterministically, including fractions such as "1 ½ hours" and ranges such as "25-30 minutes".

## Install

Recipe Mode isn't on the Chrome Web Store yet. To install from source:

1. Download the latest `recipe-mode-x.y.z.zip` from [Releases](https://github.com/dgr8akki/recipe-mode/releases) and unzip it, or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder (or `src/` in a clone).
4. Pin **Recipe Mode** from the puzzle-piece menu.

Following a recipe, Back and Next, step timers, the ingredient list and reading aloud work straight away; the settings page that opens on install has a **Try a sample recipe** button. Voice and typed commands need Jev, so for those you need either a [TypeSafe API key](https://console.typesafe.ai/keys) or a [Vercel AI Gateway API key](https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys): pick your provider, paste the key and select **Connect**; it's checked before it's saved. Jev costs $0.042 per million input tokens (about $0.0001 per command). With Vercel, set a [spend limit](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets) on the key.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/options-dark.png" />
  <img src="docs/options-light.png" width="520" alt="The Recipe Mode settings page: a Connect Jev section with a choice between Vercel AI Gateway and TypeSafe, numbered setup steps for the chosen provider, an API key field and a Connect button." />
</picture>

> [!NOTE]
> Use Google Chrome. Brave ships no working speech recognition; you can still type commands there.

## Usage

1. Open a recipe, then click the Recipe Mode icon to open the side panel.
2. Use **Back** and **Next**, tap a **Start the … timer** button, or open the ingredient list. None of this needs a key.
3. For voice, connect a key: the microphone button reads **Connect Jev for voice** until you do. Then select **Start listening**. The first time, Chrome asks for microphone access in a new tab.

| Say                                                          | What happens                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| "Next", "go back", "what was that?", "start over"            | Moves between steps and reads the step aloud                   |
| "Go to step 4", "go to the step where I add the eggs"        | Jumps to that step                                             |
| "How much butter?"                                           | Reads the ingredient line, for example "140g butter, softened" |
| "What do I need for this step?", "what are the ingredients?" | Lists the ingredients for this step, or all of them            |
| "Set a timer", "set a timer for 12 minutes"                  | Starts a timer from the step's own time, or the time you say   |
| "How long is left?", "cancel the timer"                      | Reads or cancels timers; a ringing timer is cancelled first    |
| "Stop"                                                       | Stops reading, even mid-sentence, and silences finished timers |

You can type any command in the box under the microphone button.

## Privacy and permissions

| Permission                | Why                                                                  |
| ------------------------- | -------------------------------------------------------------------- |
| `sidePanel`               | Shows the assistant next to the recipe                               |
| `scripting`, `<all_urls>` | Reads the recipe on the tab you're viewing and highlights the step   |
| `storage`                 | Keeps your API key and settings in this browser                      |
| `alarms`, `notifications` | Rings a timer and shows a notice when the side panel is closed       |
| Microphone                | Hears commands; audio is transcribed by the browser and never stored |

While the side panel is open, Recipe Mode checks each page you view for a recipe (locally); only the recipe's steps and ingredients are ever sent. They go, with your transcript as you speak it, to TypeSafe to run Jev, directly or through Vercel AI Gateway, whichever you picked. Nothing else leaves your browser. See [PRIVACY.md](PRIVACY.md).

## Development

Requires Node.js 22 or later. [CONTRIBUTING.md](CONTRIBUTING.md) covers what to check before a pull request and how a release is cut.

```sh
npm install
npm run check      # lint + format check + unit tests
npm run eval       # live evaluation against Jev (needs TYPESAFE_API_KEY or AI_GATEWAY_API_KEY in .env)
npm run package    # builds dist/recipe-mode-<version>.zip for the Chrome Web Store
```

| Script            | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `npm test`        | Unit tests with `node:test`; Jev is faked, runs offline     |
| `npm run lint`    | ESLint                                                      |
| `npm run format`  | Prettier                                                    |
| `npm run eval`    | Real Jev calls on 16 spoken phrases; waits out rate limits  |
| `npm run icons`   | Renders `assets/icon.svg` to PNGs with headless Chrome      |
| `npm run package` | Zips `src/` for upload and checks the version numbers match |

### Project structure

```
src/
├── manifest.json
├── background.js          Opens the side panel; rings timers when the panel is closed
├── theme.css              Colour, type and button tokens shared by every page
├── fonts/                 Archivo (SIL OFL 1.1), bundled so nothing loads from the network
├── panel/                 Side panel UI (HTML, CSS, controller)
├── options/               Pick a provider; connect, test, replace or remove the key
├── permission/            One-time microphone permission page
├── demo/                  Sample recipe page, opened from settings
└── lib/
    ├── assistant.js       Builds Jev questions and turns answers into intents
    ├── chime.js           The timer bell, on one shared AudioContext
    ├── durations.js       Finds cooking times in text ("1 ½ hours", "25-30 mins")
    ├── connection.js      "Connected via …" row; opens settings
    ├── jev.js             Jev client for TypeSafe or Vercel: retries, rate-limit pauses, clear errors
    ├── page.js            Functions injected into the recipe tab
    ├── queue.js           One request in flight; newest partial wins
    ├── speaker.js         Reads answers aloud; mutes the mic while talking
    ├── speech.js          Word-by-word speech recognition, on-device first
    ├── timer-store.js     Keeps timers in session storage with an alarm each
    └── timers.js          Kitchen timers
test/                      Unit tests (jsdom for page functions)
evals/                     Live evaluation against Jev
```

### Tests

- **Unit tests** fake Jev and run in about a second. They cover time parsing, intent rules, the Jev client's retry and rate-limit handling, recipe extraction from real-world JSON-LD shapes, and the manifest.
- **The live evaluation** checks that real phrases map to the right intent with the real model. It isn't part of CI because it needs a key and TypeSafe rate-limits bursts.

## Troubleshooting

| Problem                                           | Fix                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| "Open a recipe to start" on a recipe              | Reload the page. The site may not publish recipe data; the heading fallback covers simple pages only.                           |
| "Speech recognition can't reach Google's servers" | You're in Brave or behind a VPN that blocks Google speech. Use Chrome, or type commands.                                        |
| "Jev is busy. Try again in 30s."                  | TypeSafe is overloaded. Wait, then repeat the command.                                                                          |
| "Your API key was rejected"                       | Select **Change** in Settings and connect a new key. New Vercel accounts need a card on file before AI Gateway serves requests. |
| Nothing happens when you speak                    | Check that your words appear under the button. If not, allow Chrome in macOS Privacy & Security → Microphone.                   |

## Limitations

- Timers keep running with the side panel closed and Chrome shows a notification when one ends, but they don't survive closing the browser. With the panel closed, a timer under 30 seconds can ring late.
- While Recipe Mode is talking, only "stop" is heard, so it doesn't react to its own voice.
- Reads the recipe from the page you open. It can't follow a recipe inside an embedded video.

## License

[MIT](LICENSE) © 2026 Aakash Pahuja. The bundled Archivo font is under the [SIL Open Font License](src/fonts/OFL.txt).
