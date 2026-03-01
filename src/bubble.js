// ── Bubble Chat UI (Shadow DOM) ───────────────────────────────────

function ensureBubbleHost() {
  if (bubbleHost) return;
  bubbleHost = document.createElement("chirp-bubble-host");
  bubbleHost.style.cssText = "display:contents;pointer-events:auto;visibility:visible;opacity:1;";
  bubbleShadow = bubbleHost.attachShadow({ mode: "open" });

  // Load bubble styles into shadow DOM
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("bubble.css");
  bubbleShadow.appendChild(link);

  document.body.appendChild(bubbleHost);
}

function openBubble(highlightId, selText, messages) {
  ensureBubbleHost();
  currentHighlightId = highlightId;

  // Clear previous bubble content (keep <link>)
  const existing = bubbleShadow.querySelector(".chirp-bubble");
  if (existing) existing.remove();

  const bubble = document.createElement("div");
  bubble.className = "chirp-bubble";

  // Header
  const header = document.createElement("div");
  header.className = "chirp-header";

  const logo = document.createElement("img");
  logo.className = "chirp-logo";
  logo.src = chrome.runtime.getURL("icons/icon48.png");
  logo.alt = "";

  const brand = document.createElement("span");
  brand.className = "chirp-brand";
  brand.textContent = "Chirp";

  const sep = document.createElement("span");
  sep.className = "chirp-sep";
  sep.textContent = "|";

  const title = document.createElement("span");
  title.className = "chirp-title";
  title.textContent = selText.length > 40 ? selText.slice(0, 37) + "\u2026" : selText;
  title.title = selText;

  const minBtn = document.createElement("button");
  minBtn.className = "chirp-minimize";
  minBtn.textContent = "\u2013";
  function setBubbleState(state) {
    const isMinimized = bubble.classList.contains("chirp-minimized");
    const isExpanded = bubble.classList.contains("chirp-expanded");

    bubble.classList.remove("chirp-minimized", "chirp-expanded");

    if (state === "minimized" && !isMinimized) {
      bubble.classList.add("chirp-minimized");
      removeTooltip();
    } else if (state === "expanded" && !isExpanded) {
      bubble.classList.add("chirp-expanded");
    }
    // else: back to normal (both removed)
  }

  minBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setBubbleState("minimized");
  });

  const expandBtn = document.createElement("button");
  expandBtn.className = "chirp-expand";
  expandBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>';
  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setBubbleState("expanded");
  });

  const closeBtn = document.createElement("button");
  closeBtn.className = "chirp-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeBubble();
  });

  header.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    setBubbleState("minimized");
  });

  header.appendChild(logo);
  header.appendChild(brand);
  header.appendChild(sep);
  header.appendChild(title);
  header.appendChild(minBtn);
  header.appendChild(expandBtn);
  header.appendChild(closeBtn);

  // Messages area
  const messagesArea = document.createElement("div");
  messagesArea.className = "chirp-messages";

  // Render existing messages (skip hidden auto-asks)
  for (const m of messages) {
    if (m.hidden) continue;
    appendMessage(messagesArea, m.role, m.content);
  }

  // Input bar
  const inputBar = document.createElement("div");
  inputBar.className = "chirp-input-bar";

  const input = document.createElement("textarea");
  input.className = "chirp-input";
  input.rows = 1;
  input.placeholder = "Ask about this text...";

  function autoResize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  input.addEventListener("input", autoResize);

  const sendBtn = document.createElement("button");
  sendBtn.className = "chirp-send";
  sendBtn.textContent = "Send";

  function handleSend() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    autoResize();
    sendMessage(highlightId, selText, text, messagesArea);
  }

  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      closeBubble();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  inputBar.appendChild(input);
  inputBar.appendChild(sendBtn);

  bubble.appendChild(header);
  bubble.appendChild(messagesArea);
  bubble.appendChild(inputBar);
  bubbleShadow.appendChild(bubble);

  // Focus input
  setTimeout(() => input.focus(), 50);
}

function closeBubble() {
  if (!bubbleShadow) return;
  const existing = bubbleShadow.querySelector(".chirp-bubble");
  if (existing) existing.remove();
  currentHighlightId = null;
  removeTooltip();
}

function openPageChat() {
  if (!chirpEnabled) return;
  // If page chat already open, un-minimize and focus input
  if (currentHighlightId === PAGE_CHAT_ID && bubbleShadow) {
    const bubble = bubbleShadow.querySelector(".chirp-bubble");
    if (bubble) {
      bubble.classList.remove("chirp-minimized");
      const input = bubbleShadow.querySelector(".chirp-input");
      if (input) input.focus();
      return;
    }
  }
  closeBubble();
  openBubble(PAGE_CHAT_ID, "Page Chat", pageChatMessages);
  // Set placeholder for page chat
  if (bubbleShadow) {
    const input = bubbleShadow.querySelector(".chirp-input");
    if (input) input.placeholder = "Ask about this page...";
  }
}

function appendMessage(container, role, content) {
  const div = document.createElement("div");
  div.className = "chirp-msg chirp-msg-" + role;
  if (content) {
    div.innerHTML = renderMarkdown(content);
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

// ── Inline API key setup form ─────────────────────────────────────

function renderSetupForm(container, highlightId, selText, messagesArea, code) {
  container.textContent = "";
  container.classList.remove("chirp-msg-error");
  container.classList.add("chirp-setup-form");

  const label = document.createElement("div");
  label.className = "chirp-setup-label";
  label.textContent = code === "INVALID_API_KEY"
    ? "Your API key was rejected. Please check it and try again."
    : "Add an API key to get started";
  container.appendChild(label);

  const providerSelect = document.createElement("select");
  providerSelect.className = "chirp-setup-select";
  for (const [value, name] of [["anthropic", "Anthropic"], ["google", "Google Gemini"], ["openai", "OpenAI"], ["openrouter", "OpenRouter"]]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = name;
    providerSelect.appendChild(opt);
  }
  container.appendChild(providerSelect);

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.className = "chirp-setup-input";
  keyInput.placeholder = "Paste your API key";
  container.appendChild(keyInput);

  const saveBtn = document.createElement("button");
  saveBtn.className = "chirp-send chirp-setup-save";
  saveBtn.textContent = "Save & Retry";
  container.appendChild(saveBtn);

  // Pre-fill from storage
  chrome.storage.sync.get(["provider", "apiKey"], (data) => {
    if (data.provider) providerSelect.value = data.provider;
    if (data.apiKey) keyInput.value = data.apiKey;
  });

  function handleSave() {
    const key = keyInput.value.trim();
    if (!key) { keyInput.focus(); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    chrome.storage.sync.set({ provider: providerSelect.value, apiKey: key }, () => {
      // Remove the setup form and retry
      container.remove();
      sendMessage(highlightId, selText, "In 1-2 sentences, explain this and relate it to the page if relevant.", messagesArea, { hidden: true });
    });
  }

  saveBtn.addEventListener("click", handleSave);
  keyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSave();
  });

  setTimeout(() => keyInput.focus(), 50);
}

// ── Chat messaging ────────────────────────────────────────────────

function sendMessage(highlightId, selText, userText, messagesArea, { hidden = false } = {}) {
  if (!contextValid()) return;
  const isPageChat = highlightId === PAGE_CHAT_ID;

  function doSend(chatMessages, hl) {
    chatMessages.push({ role: "user", content: userText, hidden: hidden || undefined });
    if (!hidden) appendMessage(messagesArea, "user", userText);

    // Create assistant message placeholder with loading dots
    const assistantDiv = appendMessage(messagesArea, "assistant", "");
    assistantDiv.classList.add("chirp-msg-loading");

    // Open port for streaming
    const port = chrome.runtime.connect({ name: "chirp-chat" });

    port.postMessage({
      type: "chat",
      mode: isPageChat ? "page-chat" : "highlight",
      selection: selText,
      pageContext: getPageContext(),
      messages: chatMessages.map(({ role, content }) => ({ role, content })),
    });

    let assistantText = "";

    port.onMessage.addListener((msg) => {
      if (msg.type === "delta") {
        assistantDiv.classList.remove("chirp-msg-loading");
        assistantText += msg.text;
        assistantDiv.innerHTML = renderMarkdown(assistantText);
        messagesArea.scrollTop = messagesArea.scrollHeight;
      } else if (msg.type === "done") {
        if (assistantText) {
          chatMessages.push({ role: "assistant", content: assistantText });
          assistantDiv.innerHTML = renderMarkdown(assistantText);
        }
        // Persist updated messages (highlight chat only)
        if (!isPageChat && hl) {
          hl.messages = chatMessages;
          chrome.runtime.sendMessage({
            type: "updateHighlight",
            url: location.href,
            highlight: hl,
          });
        }
        port.disconnect();
      } else if (msg.type === "error") {
        assistantDiv.classList.remove("chirp-msg-loading");
        if (msg.code === "NO_API_KEY" || msg.code === "INVALID_API_KEY") {
          renderSetupForm(assistantDiv, highlightId, selText, messagesArea, msg.code);
        } else {
          assistantDiv.textContent = "Error: " + msg.error;
        }
        assistantDiv.classList.add("chirp-msg-error");
        port.disconnect();
      }
    });
  }

  if (isPageChat) {
    doSend(pageChatMessages, null);
  } else {
    // Get current stored messages for this highlight
    chrome.runtime.sendMessage({ type: "getHighlights", url: location.href }, (highlights) => {
      const hl = highlights?.find((h) => h.id === highlightId);
      doSend(hl?.messages || [], hl);
    });
  }
}
