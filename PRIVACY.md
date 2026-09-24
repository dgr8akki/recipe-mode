# Privacy policy

_Last updated: 25 September 2026_

Recipe Mode is a Chrome extension that lets you follow a recipe by voice. It has no servers, accounts or analytics of its own.

## What is processed, and where

| Data                                    | Where it goes                                                                                                            | Why                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Your microphone audio                   | Your browser's speech recognition: on your device where Chrome supports it, otherwise Google's speech service            | Turning speech into text            |
| The text of your commands               | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which forwards it to [TypeSafe](https://typesafe.ai) to run Jev | Understanding what you asked        |
| The recipe's steps and ingredient lines | Vercel AI Gateway and TypeSafe, as above                                                                                 | Matching your request to the recipe |
| Your AI Gateway API key and settings    | `chrome.storage.local` in this browser only, readable only by the extension's own pages                                  | Authenticating requests             |

Recipe Mode never records or stores audio. It doesn't read pages you don't open it on, and it sends nothing about your browsing history.

Requests to AI Gateway are billed to your own Vercel account and are subject to the privacy policies of [Vercel](https://vercel.com/legal/privacy-policy) and TypeSafe.

## Permissions

- **Access to websites (`<all_urls>`) and `scripting`**: to read the recipe on the tab you're viewing and highlight the current step. Nothing is read until you open the side panel.
- **`sidePanel`**: to show the assistant beside the recipe.
- **`storage`**: to keep your API key and settings.
- **Microphone** (asked for once): to hear your commands.

## Your choices

Stop listening at any time with the microphone button. Removing the extension deletes your stored key and settings.

## Contact

Questions: open an issue at [github.com/dgr8akki/recipe-mode](https://github.com/dgr8akki/recipe-mode/issues).
