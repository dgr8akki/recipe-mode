# Privacy policy

_Revised 1 October 2026_

Recipe Mode reads a recipe to you in Chrome's side panel and listens for what you ask while you cook. When you say or type a command, that command and the recipe's text go to the model provider you set up. When the microphone is off and you are not typing, the extension sends nothing, and it does not keep a record of what you cooked or said.

## What goes where while you cook

| Data                                    | Where it goes                                                                                                                                                                                         | Why                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Your microphone audio                   | Your browser's speech recognition: on your device where Chrome supports it, otherwise Google's speech service                                                                                         | Turning speech into text            |
| The text of your commands               | Whichever provider you connected: [TypeSafe](https://typesafe.ai), or [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), which hands each request on to TypeSafe to run Jev                     | Understanding what you asked        |
| The recipe's steps and ingredient lines | Sent along with each command, in the same request                                                                                                                                                     | Matching your request to the recipe |
| Your API key                            | Stored in `chrome.storage.local` in this browser, readable only by the extension's own pages, and sent as a bearer token in the `Authorization` header of each request to the provider that issued it | Authenticating requests             |
| Your provider choice and settings       | `chrome.storage.local` in this browser only                                                                                                                                                           | Remembering your choices            |
| Your kitchen timers                     | `chrome.storage.session` in this browser only; cleared when Chrome closes                                                                                                                             | Ringing on time with the panel shut |

Recipe Mode never records or stores audio. While the side panel is open, it checks each page you view for a recipe (locally); only the recipe's steps and ingredients are ever sent. Pages without a recipe are read on your device and forgotten. Nothing about your browsing history, the page's address or its title leaves your browser.

Requests go out as you speak: each partial phrase the browser transcribes is sent with the recipe's steps and ingredients, not only the finished command, so that simple commands like "next" can act before you have finished the sentence. A command you type goes out a single time, when you press Enter.

Because the key is yours, the bill for those requests lands on your TypeSafe or Vercel account. What happens to them there is set by TypeSafe's privacy policy and, on the gateway route, by [Vercel's](https://vercel.com/legal/privacy-policy) as well.

## Permissions

- **Access to websites (`<all_urls>`) and `scripting`**: to find and read the recipe and highlight the current step. While the side panel is open, Recipe Mode checks each page you view for a recipe (locally); only the recipe's steps and ingredients are ever sent. With the panel closed, no page is read.
- **`sidePanel`**: to show the assistant beside the recipe.
- **`storage`**: holds the key, the provider it belongs to and the read-aloud switch, plus the running timers.
- **`alarms`** and **`notifications`**: to ring a kitchen timer and show a notice when the side panel is closed. Timers are kept in this browser's session storage. Nothing leaves the browser for either permission.
- **Microphone**: Chrome asks you the first time you press Start listening, on a page of its own. Recipe Mode needs it only to hear what you say.

## Turning things off

Press the microphone button again and it stops listening. Take the key out in settings and no request is made at all, though Back, Next and the timers still work without one. Uninstall Recipe Mode and Chrome throws away the key and settings with it.

## Questions

If something here is unclear or looks wrong, write to pahujaaakash5@gmail.com. Bugs and requests can also go on the [issue tracker](https://github.com/dgr8akki/recipe-mode/issues).
