# Chirpy

A Chrome extension that lets you highlight text on any webpage and chat with AI about it.

## Features

- **Highlight & Chat** — Select text on any page to open an AI chat bubble about it
- **Color-coded highlights** — Choose from 6 colors (amber, blue, green, pink, purple, red) to organize your annotations
- **Persistent highlights** — Highlights and chat history are saved and restored on page reload
- **Streaming responses** — AI replies stream in token-by-token with markdown rendering
- **Multi-provider support** — Works with OpenAI, Anthropic, and Google Gemini
- **Popup manager** — View, navigate to, and delete all highlights on the current page

## Setup

1. Clone this repo
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the project folder
4. Click the Chirpy icon in the toolbar, go to **Settings**, and add your API key

### Supported providers & default models

| Provider | Default Model |
|----------|---------------|
| OpenAI | `gpt-4o` |
| Anthropic | `claude-sonnet-4-5-20250929` |
| Google Gemini | `gemini-2.0-flash` |

## Usage

1. Select any text on a webpage — a tooltip with "Ask Chirpy" and color dots appears
2. Click a color dot (or "Ask Chirpy" for amber) to highlight the text and open the chat bubble
3. The AI automatically provides context about the highlighted text
4. Ask follow-up questions in the chat input
5. Click a highlight to reopen its chat history
6. Manage all highlights from the popup's **Annotations** tab

## Project Structure

```
├── manifest.json      # Extension manifest (MV3)
├── background.js      # Service worker — AI API calls, highlight storage
├── content.js         # Content script — highlighting, tooltip, chat bubble
├── content.css        # Tooltip styles
├── bubble.css         # Chat bubble styles (injected into Shadow DOM)
├── popup.html/js/css  # Extension popup — settings & annotation manager
├── lib/
│   └── marked.min.js  # Markdown rendering
└── icons/             # Extension icons
```
