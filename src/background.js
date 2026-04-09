const DEFAULTS = {
  openai: "gpt-4.1",
  anthropic: "claude-sonnet-4-5-20250929",
  google: "gemini-2.5-flash",
  openrouter: "anthropic/claude-sonnet-4.5",
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "welcome.html" });
  }
});

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["provider", "apiKey", "model", "customInstructions"], (data) => {
      const provider = data.provider || "openai";
      resolve({
        provider,
        apiKey: data.apiKey || "",
        model: data.model || DEFAULTS[provider],
        customInstructions: data.customInstructions || "",
      });
    });
  });
}

// ── Highlight storage helpers ──────────────────────────────────────

function storageKeyForUrl(url) {
  // Strip hash to treat same-page anchors as one entry
  try {
    const u = new URL(url);
    u.hash = "";
    return "hl:" + u.href;
  } catch {
    return "hl:" + url;
  }
}

async function getHighlights(url) {
  const key = storageKeyForUrl(url);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (data) => resolve(data[key] || []));
  });
}

async function saveHighlights(url, highlights) {
  const key = storageKeyForUrl(url);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: highlights }, resolve);
  });
}

// ── Page chat storage helpers ─────────────────────────────────────

function pageChatKeyForUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return "pc:" + u.href;
  } catch {
    return "pc:" + url;
  }
}

async function getPageChat(url) {
  const key = pageChatKeyForUrl(url);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (data) => resolve(data[key] || []));
  });
}

async function savePageChat(url, messages) {
  const key = pageChatKeyForUrl(url);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: messages }, resolve);
  });
}

// ── AI API helpers ─────────────────────────────────────────────────

function buildOpenAIRequest(settings, systemPrompt, messages) {
  return {
    url: "https://api.openai.com/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: {
      model: settings.model,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    },
  };
}

function buildAnthropicRequest(settings, systemPrompt, messages) {
  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: {
      model: settings.model,
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages,
    },
  };
}

function buildGoogleRequest(settings, systemPrompt, messages) {
  // Convert chat messages to Google's format
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:streamGenerateContent?alt=sse&key=${settings.apiKey}`,
    headers: { "Content-Type": "application/json" },
    body: {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
    },
  };
}

function buildOpenRouterRequest(settings, systemPrompt, messages) {
  return {
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
      "HTTP-Referer": "https://chirp.app",
    },
    body: {
      model: settings.model,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    },
  };
}

function buildRequest(settings, systemPrompt, messages) {
  switch (settings.provider) {
    case "anthropic":
      return buildAnthropicRequest(settings, systemPrompt, messages);
    case "google":
      return buildGoogleRequest(settings, systemPrompt, messages);
    case "openrouter":
      return buildOpenRouterRequest(settings, systemPrompt, messages);
    default:
      return buildOpenAIRequest(settings, systemPrompt, messages);
  }
}

// Extract text delta from a SSE chunk per provider
function extractDelta(provider, parsed) {
  switch (provider) {
    case "openai":
    case "openrouter": {
      const delta = parsed.choices?.[0]?.delta?.content;
      return delta || "";
    }
    case "anthropic": {
      if (parsed.type === "content_block_delta") {
        return parsed.delta?.text || "";
      }
      return "";
    }
    case "google": {
      return parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }
    default:
      return "";
  }
}

// ── Message handling ───────────────────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "chirp-chat") return;

  let abortController = null;

  port.onDisconnect.addListener(() => {
    if (abortController) abortController.abort();
  });

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== "chat") return;

    const settings = await getSettings();
    if (!settings.apiKey) {
      port.postMessage({ type: "error", error: "No API key configured. Open Chirp settings to add one.", code: "NO_API_KEY" });
      return;
    }

    let systemPrompt;

    if (msg.mode === "page-chat") {
      systemPrompt = [
        "You are Chirp, a helpful assistant embedded in the user's browser.",
        "The user is chatting about the webpage they are currently viewing.",
        "",
        msg.pageContext
          ? "=== Page Content (truncated) ===\n" + msg.pageContext + "\n================================"
          : "",
        "",
        "Your primary job is to answer questions about the page content.",
        "",
        "Keep answers concise. Expand only when the user asks follow-up questions.",
        "Be short and concise. Respond sparingly — if a message doesn't need a reply, don't force one.",
        "Never describe which website the user is on — they already know. Jump straight to insight, explanation, or answering the question.",
        "Never end with follow-up questions like \"Would you like to know more?\" — just answer and stop.",
        "Use markdown formatting when it improves clarity.",
      ].join("\n");
    } else {
      systemPrompt = [
        "You are Chirp, a helpful assistant embedded in the user's browser.",
        "The user has highlighted a specific term or passage on a webpage.",
        "",
        "=== Highlighted Text ===",
        msg.selection,
        "========================",
        "",
        msg.pageContext
          ? "=== Page Content (truncated) ===\n" + msg.pageContext + "\n================================"
          : "",
        "",
        "Your primary job is to explain the highlighted term or concept — what it means, why it's significant, or how it works.",
        "Your secondary job is to relate it to the surrounding page content when doing so adds useful context.",
        "",
        "Keep initial explanations to 1-2 sentences. Expand only when the user asks follow-up questions.",
        "Be short and concise. Respond sparingly — if a message doesn't need a reply, don't force one.",
        "Never restate what the highlighted text says or describe which website the user is on — they already know. Jump straight to insight, explanation, or answering the question.",
        "Never end with follow-up questions like \"Would you like to know more?\" — just answer and stop.",
        "Use markdown formatting when it improves clarity.",
      ].join("\n");
    }

    if (settings.customInstructions) {
      systemPrompt += "\n\nUser's custom instructions:\n" + settings.customInstructions;
    }

    const req = buildRequest(settings, systemPrompt, msg.messages);
    abortController = new AbortController();

    try {
      const resp = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: abortController.signal,
      });

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          port.postMessage({ type: "error", error: "Invalid API key.", code: "INVALID_API_KEY" });
        } else {
          const errText = await resp.text();
          port.postMessage({ type: "error", error: `API error ${resp.status}: ${errText}` });
        }
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const text = extractDelta(settings.provider, parsed);
            if (text) {
              port.postMessage({ type: "delta", text });
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      port.postMessage({ type: "done" });
    } catch (err) {
      if (err.name === "AbortError") return; // User closed bubble — expected
      port.postMessage({ type: "error", error: err.message });
    }
  });
});

// Handle one-shot messages for highlight CRUD
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getHighlights") {
    getHighlights(msg.url).then(sendResponse);
    return true; // async
  }

  if (msg.type === "saveHighlight") {
    getHighlights(msg.url).then((highlights) => {
      highlights.push(msg.highlight);
      saveHighlights(msg.url, highlights).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  if (msg.type === "updateHighlight") {
    getHighlights(msg.url).then((highlights) => {
      const idx = highlights.findIndex((h) => h.id === msg.highlight.id);
      if (idx !== -1) highlights[idx] = msg.highlight;
      saveHighlights(msg.url, highlights).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  if (msg.type === "getPageChat") {
    getPageChat(msg.url).then(sendResponse);
    return true;
  }

  if (msg.type === "savePageChat") {
    savePageChat(msg.url, msg.messages).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "openPageChatRelay") {
    chrome.tabs.sendMessage(msg.tabId, { type: "openPageChat" }).catch(() => {});
    return;
  }

  if (msg.type === "deleteHighlight") {
    getHighlights(msg.url).then((highlights) => {
      const filtered = highlights.filter((h) => h.id !== msg.id);
      saveHighlights(msg.url, filtered).then(() => sendResponse({ ok: true }));
    });
    return true;
  }
});

// ── Keyboard shortcut → page chat ───────────────────────────────────

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-page-chat") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "openPageChat" }).catch(() => {});
      }
    });
  }
});

