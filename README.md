# Chirpy

AI highlighting for the web. Select text on any page, click Chirpy, and get an instant AI explanation. All highlights and conversations stay private in your browser. Bring your own OpenAI, Anthropic, or Google Gemini API key.

## Features

- **AI highlighter** - Select text on any page, click the Chirpy bird tooltip to highlight it and chat with AI about it
- **Private by design** - All highlights and chat history are stored locally in your browser. Nothing is sent to a server besides the AI API you choose.
- **Bring your own key** - Use your existing OpenAI, Anthropic, or Google Gemini account. No Chirpy account needed.
- **Highlight manager** - View, navigate to, and delete all highlights on the current page
- **Customize your AI** - Customize how Chirpy responds via the settings panel

### Supported providers & default models

| Provider | Default Model |
|----------|---------------|
| Anthropic | `claude-sonnet-4-5-20250929` |
| OpenAI | `gpt-4o` |
| Google Gemini | `gemini-2.0-flash` |

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
6. Manage all highlights from the popup's **Annotations** tab.

## Project Structure

```
manifest.json        Extension manifest (MV3)
background.js        Service worker: AI API calls, highlight storage
content.js           Content script: highlighting, tooltip, chat bubble
content.css          Tooltip styles
bubble.css           Chat bubble styles (injected into Shadow DOM)
popup.html           Extension popup markup
popup.js             Popup logic: settings & annotation manager
popup.css            Popup styles
lib/marked.min.js    Markdown rendering library
icons/               Extension icons (16, 48, 128px)
scripts/build.sh     Builds dist zip for Chrome Web Store upload
scripts/release.sh   Bumps version, syncs manifest, builds dist zip
scripts/sync-version.sh  Syncs manifest.json version from package.json
```

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
