# Privacy policy

_Last updated: 30 September 2026_

Recipe Mode is a Chrome extension that lets you follow a recipe by voice. It has no servers, accounts or analytics of its own.

## What is processed, and where

| Data                                    | Where it goes                                                                                                                                                          | Why                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Your microphone audio                   | Your browser's speech recognition: on your device where Chrome supports it, otherwise Google's speech service                                                          | Turning speech into text            |
| The text of your commands               | The provider you pick in settings: [TypeSafe](https://typesafe.ai) directly, or [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which forwards it to TypeSafe | Understanding what you asked        |
| The recipe's steps and ingredient lines | The same provider, as above                                                                                                                                            | Matching your request to the recipe |
| Your API key, provider and settings     | `chrome.storage.local` in this browser only, readable only by the extension's own pages                                                                                | Authenticating requests             |

Recipe Mode never records or stores audio. While the side panel is open, Recipe Mode checks each page you view for a recipe (locally); only the recipe's steps and ingredients are ever sent. Pages without a recipe are read on your device and forgotten. Nothing about your browsing history, the page's address or its title leaves your browser.

Requests go out as you speak: each partial phrase the browser transcribes is sent with the recipe's steps and ingredients, not only the finished command, so that simple commands like "next" can act before you have finished the sentence. Typed commands are sent once.

Requests are billed to your own TypeSafe or Vercel account and are subject to the privacy policies of TypeSafe and, if you use it, [Vercel](https://vercel.com/legal/privacy-policy).

## Permissions

- **Access to websites (`<all_urls>`) and `scripting`**: to find and read the recipe and highlight the current step. While the side panel is open, Recipe Mode checks each page you view for a recipe (locally); only the recipe's steps and ingredients are ever sent. With the panel closed, no page is read.
- **`sidePanel`**: to show the assistant beside the recipe.
- **`storage`**: to keep your API key and settings.
- **`alarms`** and **`notifications`**: to ring a kitchen timer and show a notice when the side panel is closed. Timers are kept in this browser's session storage and are gone when you close Chrome.
- **Microphone** (asked for once): to hear your commands.

## Your choices

Stop listening at any time with the microphone button. Removing the extension deletes your stored key and settings.

## Contact

Questions: open an issue at [github.com/dgr8akki/recipe-mode](https://github.com/dgr8akki/recipe-mode/issues).
