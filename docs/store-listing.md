# Chrome Web Store listing

Repo must be public before upload; all URLs below are 404 while it is private.

Copy for each Developer Dashboard field, written against `src/manifest.json` at 1.3.0. Fields with a length limit show their character count next to the limit. The permission answers describe the code as it is now, so reread them whenever the manifest's permissions move.

## Store listing tab

### Title (limit 45; 31 used)

> Recipe Mode: hands-free cooking

Taken from the manifest `name`.

### Summary (limit 132; 115 used)

> A voice recipe reader with kitchen timers. Open a recipe, say "next" or "how much butter?" and it answers out loud.

Taken from the manifest `description`; only editable there.

### Detailed description (plain text)

```text
Hands-free cooking on any recipe page: say "next", "how much butter?" or "set a timer".

Recipe Mode is a voice recipe reader and cooking assistant for Chrome. Open a recipe and the side panel shows the current step in big type, reads it aloud, answers questions from the ingredient list, runs kitchen timers and outlines the step on the page.

Things to say at the stove
Moving around: "next", "go back", "what was that?", "start over", "go to the step where I add the eggs".
Ingredients: "how much butter?" reads the line from the recipe. "What do I need for this step?" lists what the current step uses.
Timers: "set a timer" uses the time in the current step; "set a timer for 12 minutes" uses yours. "How long is left?" and "cancel the timer" do what they say. Every step that mentions a time also gets a one-tap button. A finished timer chimes while the panel is open; with it closed, Chrome shows a notification until you dismiss it.
"Stop" cuts a readout off mid-sentence and silences a ringing timer.
Kitchen chatter is left alone: "honey, pass the salt" is not a command, and it can tell.

Works on any recipe site
Most recipe sites publish schema.org recipe data for search engines; Recipe Mode reads that, and falls back to the Ingredients and Method lists on plainer pages. Times such as "1 ½ hours" or "25-30 minutes" are read by code.

Easy to read
Large type, a ruler-style progress bar and a dark theme for dim kitchens. The same design helps if small controls are hard work for your eyes or your hands.

Your data
Speech is transcribed by Chrome, on your device where it can and otherwise by Google's speech service, and never recorded. When you give a command, its text and the recipe's steps and ingredient lines go to Jev at TypeSafe, either straight from your browser or by way of your Vercel AI Gateway account. No page address, history or audio goes anywhere. While the panel is open it checks each page you view for a recipe, locally. Full policy: github.com/dgr8akki/recipe-mode/blob/main/PRIVACY.md

Getting set up
Nothing at all to follow a recipe: the steps, Back and Next, the timers, the ingredient list and reading aloud work as soon as it is installed. Commands, spoken or typed, are understood by Jev, TypeSafe's decision model, and that part runs on a key you bring from TypeSafe or Vercel AI Gateway. Cooking a whole dinner by voice costs less than a cent. It needs Chrome 116 or later and understands English for now.

Where it falls short
Timers survive the panel closing but not Chrome closing. It cannot see a recipe inside a video. In Brave, which has no working speech recognition, you can only type.

Support: github.com/dgr8akki/recipe-mode/issues. Open source under the MIT licence.
```

### Category and language

> Category: Household
> Language: English (United Kingdom)

### Screenshots

Five 1280x800 shots, a 440x280 tile and a 1400x560 marquee are staged under `screenshots/recipe-mode/store/` in the reports folder and need a reshoot after the layout changes in this release (tracked separately).

### URLs

> Official URL: leave empty
> Homepage URL: https://github.com/dgr8akki/recipe-mode
> Support URL: https://github.com/dgr8akki/recipe-mode/issues

## Privacy practices tab

### Single purpose description

> Recipe Mode is a hands-free cooking assistant. It reads the recipe on the user's current tab into a side panel and lets the user move between steps, ask about ingredients and run kitchen timers by voice or typed command, reading answers aloud and outlining the current step on the page.

### Permission justifications

`sidePanel`

> The whole interface is a side panel (panel/panel.html): the current step in large type, the ingredient list, timers, the microphone and a typed-command field. Declaring sidePanel is what lets Chrome show that page beside the tab when the toolbar icon is clicked. There is no popup and no injected UI beyond an outline around the current step.

`storage`

> Saves in chrome.storage.local the API key the user connected, which of TypeSafe or Vercel AI Gateway issued it, and one on/off setting (read answers aloud), readable only by the extension's own pages. chrome.storage.session holds the running kitchen timers, so they survive the side panel closing, and the timestamp until which the provider has asked us to wait after a rate limit; both are cleared when the browser closes. No recipes, transcripts or browsing data are stored.

`scripting`

> Used with chrome.scripting.executeScript on the active tab to run three self-contained functions. extractRecipe() reads the page's schema.org Recipe JSON-LD (title, ingredient lines, instruction steps), falling back to list items under an Ingredients / Method / Instructions heading; the result is shown in the side panel and never stored. highlightStep() outlines the element containing the current step and scrolls it into view; clearHighlight() removes that outline when the panel closes or moves to another tab. Extraction runs only while the side panel is open, when the active tab changes or finishes loading, and only on http(s) pages and the extension's own bundled sample recipe page (demo/lemon-drizzle.html), so the panel follows the recipe the user is looking at. No page data is read while the panel is closed.

`host_permissions: <all_urls>`

> Recipes are published on tens of thousands of independent sites, so there is no host list to enumerate. The permission lets the side panel read the recipe from whatever tab the user opens it on, outline the current step there, and read the tab's URL to notice when the user has moved to a different recipe (compared locally, never sent). The same grant is what lets the panel POST commands to the model, at https://api.typesafe.ai or https://ai-gateway.vercel.sh depending on the provider the user connected. The extension reads only recipe data; it never reads form fields, cookies or other page text, and it never runs on a page until the user opens the panel.

`alarms`

> One alarm per running kitchen timer, named after the timer, so the service worker wakes when the timer ends even if the side panel has been closed. Alarms are created when a timer starts and cleared when it is removed or finishes. Nothing is sent anywhere.

`notifications`

> When a kitchen timer ends and no side panel is open to chime, a notification such as "Step 4: 30 mins is done" is shown, kept until the user dismisses it. Clicking it removes the timer. With the panel open no notification is shown; the panel chimes and speaks instead. Nothing is sent anywhere.

Recipe Mode declares neither content_scripts nor web_accessible_resources; the step outline is drawn with chrome.scripting only while the panel is open.

### Remote code

> No. Recipe Mode runs only the JavaScript it was uploaded with. It never downloads code to run, and there is no eval or new Function in it. The panel's only requests are POSTs of a command and the recipe text to the model, and what comes back is a JSON list of probabilities. Text-to-speech uses the browser's built-in speechSynthesis. The Archivo font is bundled (src/fonts, OFL). The two innerHTML uses are constant strings: an SVG icon in the panel and the setup-step markup on the settings page.

### Data usage disclosure

Tick: User activity (voice and typed commands are sent as text), Website content (the recipe's steps and ingredient lines are sent with each command), Authentication information (the API key is sent as a bearer token to its issuer).

Leave unticked: Personally identifiable information, Health, Financial, Personal communications, Location, Web history (no URL or title is ever sent).

Certifications: tick all three. The data is never sold or handed to anyone beyond the model provider, it is used for nothing except reading the recipe and answering commands (there are no analytics), and it plays no part in lending or credit decisions.

### Privacy policy URL

> https://github.com/dgr8akki/recipe-mode/blob/main/PRIVACY.md

## Distribution tab

> Upload the first version as Unlisted and switch it to Public once it has passed review. All regions, free, no mature content.

## Release notes (v1.3.0, for the GitHub release)

> Timers keep running after the side panel closes and ring with a notification. The recipe, step buttons and timers work before you connect a key. Clear spoken errors, big-type layout that survives 200 % zoom, and a long list of accessibility fixes.
