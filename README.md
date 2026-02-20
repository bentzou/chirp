# <img src="src/icons/icon128.png" width="32" height="32" alt="Chirpy icon"> Chirpy

AI highlighting for the web. Select text on any page, click Chirpy, and get an instant AI explanation. All highlights and conversations stay private in your browser. Bring your own OpenAI, Anthropic, or Google Gemini API key.

## Features

- **AI highlighter** - Select text on any page, click the Chirpy bird tooltip to highlight it and chat with AI about it
- **Page chat** - Double-click the toolbar icon to chat with AI about the entire page
- **Private by design** - All highlights and chat history are stored locally in your browser. Nothing is sent to a server besides the AI API you choose.
- **Bring your own key** - Use your existing OpenAI, Anthropic, or Google Gemini account. No Chirpy account needed.
- **Highlight manager** - View, navigate to, and delete all highlights on the current page
- **Customize your AI** - Choose your model from a dropdown and add custom instructions via the settings panel

### Supported providers & models

| Provider | Default | Also available |
|----------|---------|----------------|
| Anthropic | Claude Sonnet 4.5 | Haiku 4.5, Opus 4.6 |
| OpenAI | GPT-4.1 | GPT-4.1 Mini, o4-mini, o3 |
| Google Gemini | Gemini 2.5 Flash | 2.5 Flash Lite, 2.5 Pro |

## Setup

1. Clone this repo
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the project folder
4. Select text on any page and click the Chirpy tooltip to get started (you'll be prompted to add an API key)

You can also configure your provider, API key, model, and custom instructions from the popup's **Settings** tab.

## Usage

1. Select any text on a webpage. A bird tooltip appears near your cursor.
2. Click the tooltip to highlight the text and open a chat bubble.
3. Chirpy automatically provides a brief explanation of the highlighted text.
4. Ask follow-up questions in the chat input.
5. Click an existing highlight to reopen its chat history.
6. Double-click the toolbar icon to open a page-wide chat (no highlight needed).
7. Manage all highlights from the popup's **Highlights** tab.

## Project Structure

```
manifest.json        Extension manifest (MV3)
background.js        Service worker: AI API calls, highlight storage
core.js              Shared state, constants, utilities, markdown rendering
highlight.js         Text highlighting: wrap ranges, persist, restore
bubble.js            Chat bubble UI & messaging (Shadow DOM)
events.js            Tooltip, DOM event handlers, popup message listener, init
content.css          Tooltip styles
bubble.css           Chat bubble styles (injected into Shadow DOM)
popup.html           Extension popup markup
popup.js             Popup logic: settings & annotation manager
popup.css            Popup styles
welcome.html         Getting started / onboarding page
welcome.js           Welcome page logic
welcome.css          Welcome page styles
lib/marked.min.js    Markdown rendering library
icons/               Extension icons (16, 48, 128px)
scripts/build.sh     Builds dist zip for Chrome Web Store upload
scripts/release.sh   Bumps version, syncs manifest, builds dist zip
scripts/sync-version.sh  Syncs manifest.json version from package.json
```

## v2 Roadmap

### UX & Delight
- **Multi-color highlights** — Choose from 6 colors (amber, blue, green, pink, purple, red) via a color strip in the tooltip
- **Keyboard shortcuts** — `Alt+Shift+H` to highlight selection, `Escape` to close chat, `Alt+Shift+S` to toggle Chirpy on/off
- **Export & import** — Export all highlights as JSON (per page or all pages), import to merge by highlight ID
- **Highlight notes** — Add personal notes to any highlight, separate from AI chat

### Technical Foundation
- **Error handling & logging** — Contextual error logging with a rotating 100-entry log buffer, viewable in popup Settings
- **Streaming performance & abort** — AbortController on fetch, throttled markdown re-renders, explicit port cleanup
- **Robust highlight restoration** — MutationObserver-based retry for unresolved highlights, SPA navigation detection
- **Security hardening** — DOMParser-based HTML sanitizer with tag/attribute allowlists, rate limiting (10 req/min)

### Power Features
- **Cross-highlight synthesis** — "Synthesize" button sends all page highlights to AI for themes, connections, and contradictions
- **Global highlight library** — Search across all highlights on all pages from a new Library tab in the popup
- **Smart context actions** — Right-click a highlight for pre-built AI actions: Summarize, Simplify, Define Key Terms, Translate, Copy as Markdown

## Building

```sh
npm run build
```

Creates `dist/chirpy-v<version>.zip` ready for Chrome Web Store upload or manual installation.

## Releasing

```sh
npm run release -- <patch|minor|major>
```

This bumps the version in `package.json`, syncs it to `manifest.json`, and builds the dist zip. Then push and upload:

```sh
git push && git push --tags
# Upload dist/chirpy-v<version>.zip to Chrome Web Store
```
