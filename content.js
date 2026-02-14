(() => {
  // ── Chirpy highlight color ────────────────────────────────────────

  const CHIRPY_COLOR = {
    bg: "rgba(245, 158, 11, 0.35)",
    border: "rgba(245, 158, 11, 0.6)",
    hover: "rgba(245, 158, 11, 0.5)",
    solid: "#f59e0b",
  };

  // ── Enabled state ────────────────────────────────────────────────

  const PAGE_CHAT_ID = "chirpy-page-chat";
  let pageChatMessages = [];

  let chirpyEnabled = true;

  chrome.storage.sync.get({ enabled: true }, (data) => {
    chirpyEnabled = data.enabled;
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
      chirpyEnabled = changes.enabled.newValue;
      toggleHighlightsVisibility(chirpyEnabled);
    }
  });

  function toggleHighlightsVisibility(visible) {
    document.querySelectorAll("chirpy-hl").forEach((el) => {
      el.style.backgroundColor = visible ? CHIRPY_COLOR.bg : "transparent";
      el.style.borderBottom = visible ? "2px solid " + CHIRPY_COLOR.border : "none";
      el.style.pointerEvents = visible ? "" : "none";
    });
    if (!visible) {
      removeTooltip();
      closeBubble();
    }
  }

  /** Check if the extension context is still valid (survives extension reload) */
  function contextValid() {
    try { return !!chrome.runtime?.id; } catch { return false; }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  function generateId() {
    return "chirpy-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  /** Build an XPath for a text node (returns null if the node is unreachable from document.body, e.g. inside Shadow DOM) */
  function getXPath(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentNode;
      if (!parent) return null;
      const parentPath = getXPath(parent);
      if (!parentPath) return null;
      const siblings = Array.from(parent.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
      const idx = siblings.indexOf(node) + 1;
      return parentPath + "/text()[" + idx + "]";
    }
    if (node === document.body) return "/html/body";
    const parent = node.parentNode;
    if (!parent || parent instanceof ShadowRoot) return null;
    const parentPath = getXPath(parent);
    if (!parentPath) return null;
    const siblings = Array.from(parent.children).filter((n) => n.tagName === node.tagName);
    const idx = siblings.indexOf(node) + 1;
    const tag = node.tagName.toLowerCase();
    return parentPath + "/" + tag + "[" + idx + "]";
  }

  /** Resolve an XPath back to a node */
  function resolveXPath(xpath) {
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue;
    } catch {
      return null;
    }
  }

  /** Get surrounding text for a range (used for text-search restoration) */
  function getRangeContext(range) {
    const prefix = range.startContainer.textContent.slice(Math.max(0, range.startOffset - 32), range.startOffset);
    const suffix = range.endContainer.textContent.slice(range.endOffset, range.endOffset + 32);
    return { prefix, suffix };
  }

  /** Find a text string in the page and return a Range, using prefix/suffix to disambiguate */
  function findTextRange(text, prefix, suffix) {
    const body = document.body;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    // Build a flat string and map each char to its text node + offset
    let flat = "";
    const map = []; // map[charIndex] = { node, offset }
    for (const node of textNodes) {
      const content = node.textContent;
      for (let i = 0; i < content.length; i++) {
        map.push({ node, offset: i });
      }
      flat += content;
    }

    // Search for all occurrences of the text
    let best = -1;
    let bestScore = -1;
    let searchFrom = 0;
    while (true) {
      const idx = flat.indexOf(text, searchFrom);
      if (idx === -1) break;
      // Score by how well prefix/suffix match
      let score = 0;
      if (prefix) {
        const before = flat.slice(Math.max(0, idx - prefix.length), idx);
        for (let i = 0; i < Math.min(before.length, prefix.length); i++) {
          if (before[before.length - 1 - i] === prefix[prefix.length - 1 - i]) score++;
        }
      }
      if (suffix) {
        const after = flat.slice(idx + text.length, idx + text.length + suffix.length);
        for (let i = 0; i < Math.min(after.length, suffix.length); i++) {
          if (after[i] === suffix[i]) score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
      searchFrom = idx + 1;
    }

    if (best === -1) return null;

    const start = map[best];
    const end = map[best + text.length - 1];
    if (!start || !end) return null;

    try {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset + 1);
      return range;
    } catch {
      return null;
    }
  }

  /** Get truncated page text for context */
  function getPageContext() {
    const text = document.body.innerText || "";
    return text.slice(0, 8000);
  }

  // ── Tooltip (appears on text selection) ────────────────────────────

  let tooltip = null;
  let tooltipAction = null;

  function removeTooltip() {
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
    tooltipAction = null;
  }

  // The tooltip is rendered as an <iframe> pointing to an extension page.
  // Iframes have their own browsing context: events inside are completely
  // separate from the parent page, so no site script (Reddit, etc.) can
  // intercept clicks.  The iframe communicates back via postMessage.
  window.addEventListener("message", (e) => {
    if (e.data?.type !== "chirpy-tooltip-click" || !tooltipAction) return;
    const fn = tooltipAction;
    tooltipAction = null;
    removeTooltip();
    try { fn(); } catch (err) { console.error("[Chirpy] highlightRange failed:", err); }
  });

  function showTooltip(x, y, selection) {
    removeTooltip();

    // Capture selection data eagerly — the live Selection object can be
    // cleared by the host page's JS before the user clicks the tooltip.
    let selText, range;
    if (selection && !selection.isCollapsed) {
      selText = selection.toString();
      try { range = selection.getRangeAt(0).cloneRange(); } catch (_) {}
    }

    tooltip = document.createElement("iframe");
    tooltip.src = chrome.runtime.getURL("tooltip.html");
    tooltip.style.cssText = "all:initial;position:absolute;z-index:2147483647;border:none;" +
      "width:36px;height:36px;background:#f59e0b;border-radius:50%;overflow:hidden;" +
      "pointer-events:auto;left:" + x + "px;top:" + y + "px;";
    tooltip.setAttribute("allowtransparency", "true");

    if (selText && range) {
      tooltipAction = () => highlightRange(range, selText);
    }

    document.body.appendChild(tooltip);
  }

  document.addEventListener("mouseup", (e) => {
    if (!chirpyEnabled) return;
    // Small delay to let selection finalize
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        if (!currentHighlightId && !e.target.closest?.("chirpy-hl") && !(tooltip && tooltip === e.target)) removeTooltip();
        return;
      }

      // Don't show tooltip if click is inside our bubble
      if (e.target.closest?.("chirpy-bubble-host")) return;

      const x = e.pageX - 14;
      const y = e.pageY - 40;
      showTooltip(x, y, sel);
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.detail >= 2) return; // Don't remove on multi-click (prevents tooltip blink on triple-click)
    if (tooltip && e.target !== tooltip && !currentHighlightId && !e.target.closest?.("chirpy-hl")) {
      removeTooltip();
    }
  });

  document.addEventListener("keydown", () => {
    if (!currentHighlightId) removeTooltip();
  });

  // ── Highlighting ──────────────────────────────────────────────────

  /** Wrap a Range in <chirpy-hl> elements and persist */
  function highlightRange(range, selText) {
    const id = generateId();

    // Serialize range before modifying DOM
    const ctx = getRangeContext(range);
    const startXPath = getXPath(range.startContainer);
    const endXPath = getXPath(range.endContainer);
    const serialized = {
      id,
      text: selText,
      prefix: ctx.prefix,
      suffix: ctx.suffix,
      startXPath,
      startOffset: range.startOffset,
      endXPath,
      endOffset: range.endOffset,
      messages: [],
    };

    wrapRangeInHighlight(range, id);
    window.getSelection().removeAllRanges();

    if (!contextValid()) return;

    // Open bubble immediately — don't block on the storage round-trip
    openBubble(id, selText, []);
    const messagesArea = bubbleShadow?.querySelector(".chirpy-messages");
    if (messagesArea) {
      sendMessage(id, selText, "In 1-2 sentences, explain this and relate it to the page if relevant.", messagesArea, { hidden: true });
    }

    // Persist to storage in the background (non-blocking)
    if (startXPath && endXPath) {
      chrome.runtime.sendMessage({
        type: "saveHighlight",
        url: location.href,
        highlight: serialized,
      });
    }
  }

  /** Wraps the given range's text nodes in <chirpy-hl> custom elements */
  function wrapRangeInHighlight(range, id) {
    // Collect text nodes in the range
    const textNodes = [];
    const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(node);
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const textNode of textNodes) {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(textNode);

      // Clip to selection boundaries
      if (textNode === range.startContainer) nodeRange.setStart(textNode, range.startOffset);
      if (textNode === range.endContainer) nodeRange.setEnd(textNode, range.endOffset);

      if (nodeRange.toString() === "") continue;

      const hl = document.createElement("chirpy-hl");
      hl.dataset.id = id;
      hl.style.backgroundColor = CHIRPY_COLOR.bg;
      hl.style.borderBottom = "2px solid " + CHIRPY_COLOR.border;

      hl.addEventListener("mouseenter", () => {
        if (chirpyEnabled) hl.style.backgroundColor = CHIRPY_COLOR.hover;
      });
      hl.addEventListener("mouseleave", () => {
        if (chirpyEnabled) hl.style.backgroundColor = CHIRPY_COLOR.bg;
      });

      nodeRange.surroundContents(hl);
    }
  }

  // ── Restore highlights on page load ───────────────────────────────

  /** IDs already restored — prevents double-wrapping on retry */
  const restoredIds = new Set();

  function restoreHighlights() {
    if (!contextValid()) return;
    chrome.runtime.sendMessage({ type: "getHighlights", url: location.href }, (highlights) => {
      if (chrome.runtime.lastError || !highlights || !highlights.length) return;

      for (const hl of highlights) {
        if (restoredIds.has(hl.id)) continue;

        let range = null;

        // Try XPath first (fast, exact)
        try {
          const startNode = resolveXPath(hl.startXPath);
          const endNode = resolveXPath(hl.endXPath);
          if (startNode && endNode) {
            range = document.createRange();
            range.setStart(startNode, hl.startOffset);
            range.setEnd(endNode, hl.endOffset);
            // Verify the resolved range matches the expected text
            if (range.toString() !== hl.text) range = null;
          }
        } catch {
          range = null;
        }

        // Fall back to text search with context matching
        if (!range) {
          range = findTextRange(hl.text, hl.prefix || "", hl.suffix || "");
        }

        if (range) {
          try {
            wrapRangeInHighlight(range, hl.id);
            restoredIds.add(hl.id);
          } catch { /* skip */ }
        }
      }
    });
  }

  // ── Markdown rendering ────────────────────────────────────────────
  // marked.min.js is loaded as a content script before this file,
  // so `marked` is available directly in the isolated world.

  if (typeof marked !== "undefined") {
    marked.setOptions({ breaks: true });
  }

  /** Sanitize HTML — strip <script> tags and on* event attributes */
  function sanitizeHtml(html) {
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return html;
  }

  function renderMarkdown(text) {
    if (typeof marked !== "undefined") {
      return sanitizeHtml(marked.parse(text));
    }
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Bubble Chat UI (Shadow DOM) ───────────────────────────────────

  let bubbleHost = null;
  let bubbleShadow = null;
  let currentHighlightId = null;

  function ensureBubbleHost() {
    if (bubbleHost) return;
    bubbleHost = document.createElement("chirpy-bubble-host");
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
    const existing = bubbleShadow.querySelector(".chirpy-bubble");
    if (existing) existing.remove();

    const bubble = document.createElement("div");
    bubble.className = "chirpy-bubble";

    // Header
    const header = document.createElement("div");
    header.className = "chirpy-header";

    const logo = document.createElement("img");
    logo.className = "chirpy-logo";
    logo.src = chrome.runtime.getURL("icons/icon48.png");
    logo.alt = "";

    const brand = document.createElement("span");
    brand.className = "chirpy-brand";
    brand.textContent = "Chirpy";

    const sep = document.createElement("span");
    sep.className = "chirpy-sep";
    sep.textContent = "|";

    const title = document.createElement("span");
    title.className = "chirpy-title";
    title.textContent = selText.length > 40 ? selText.slice(0, 37) + "\u2026" : selText;
    title.title = selText;

    const minBtn = document.createElement("button");
    minBtn.className = "chirpy-minimize";
    minBtn.textContent = "\u2013";
    function setBubbleState(state) {
      const isMinimized = bubble.classList.contains("chirpy-minimized");
      const isExpanded = bubble.classList.contains("chirpy-expanded");

      bubble.classList.remove("chirpy-minimized", "chirpy-expanded");

      if (state === "minimized" && !isMinimized) {
        bubble.classList.add("chirpy-minimized");
        removeTooltip();
      } else if (state === "expanded" && !isExpanded) {
        bubble.classList.add("chirpy-expanded");
      }
      // else: back to normal (both removed)
    }

    minBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setBubbleState("minimized");
    });

    const expandBtn = document.createElement("button");
    expandBtn.className = "chirpy-expand";
    expandBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>';
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setBubbleState("expanded");
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "chirpy-close";
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
    messagesArea.className = "chirpy-messages";

    // Render existing messages (skip hidden auto-asks)
    for (const m of messages) {
      if (m.hidden) continue;
      appendMessage(messagesArea, m.role, m.content);
    }

    // Input bar
    const inputBar = document.createElement("div");
    inputBar.className = "chirpy-input-bar";

    const input = document.createElement("textarea");
    input.className = "chirpy-input";
    input.rows = 1;
    input.placeholder = "Ask about this text...";

    function autoResize() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    }

    input.addEventListener("input", autoResize);

    const sendBtn = document.createElement("button");
    sendBtn.className = "chirpy-send";
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
    const existing = bubbleShadow.querySelector(".chirpy-bubble");
    if (existing) existing.remove();
    currentHighlightId = null;
    removeTooltip();
  }

  function openPageChat() {
    if (!chirpyEnabled) return;
    // If page chat already open, un-minimize and focus input
    if (currentHighlightId === PAGE_CHAT_ID && bubbleShadow) {
      const bubble = bubbleShadow.querySelector(".chirpy-bubble");
      if (bubble) {
        bubble.classList.remove("chirpy-minimized");
        const input = bubbleShadow.querySelector(".chirpy-input");
        if (input) input.focus();
        return;
      }
    }
    closeBubble();
    openBubble(PAGE_CHAT_ID, "Page Chat", pageChatMessages);
    // Set placeholder for page chat
    if (bubbleShadow) {
      const input = bubbleShadow.querySelector(".chirpy-input");
      if (input) input.placeholder = "Ask about this page...";
    }
  }

  function appendMessage(container, role, content) {
    const div = document.createElement("div");
    div.className = "chirpy-msg chirpy-msg-" + role;
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
    container.classList.remove("chirpy-msg-error");
    container.classList.add("chirpy-setup-form");

    const label = document.createElement("div");
    label.className = "chirpy-setup-label";
    label.textContent = code === "INVALID_API_KEY"
      ? "Your API key was rejected. Please check it and try again."
      : "Add an API key to get started";
    container.appendChild(label);

    const providerSelect = document.createElement("select");
    providerSelect.className = "chirpy-setup-select";
    for (const [value, name] of [["anthropic", "Anthropic"], ["google", "Google Gemini"], ["openai", "OpenAI"], ["openrouter", "OpenRouter"]]) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = name;
      providerSelect.appendChild(opt);
    }
    container.appendChild(providerSelect);

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "chirpy-setup-input";
    keyInput.placeholder = "Paste your API key";
    container.appendChild(keyInput);

    const saveBtn = document.createElement("button");
    saveBtn.className = "chirpy-send chirpy-setup-save";
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
      assistantDiv.classList.add("chirpy-msg-loading");

      // Open port for streaming
      const port = chrome.runtime.connect({ name: "chirpy-chat" });

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
          assistantDiv.classList.remove("chirpy-msg-loading");
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
          assistantDiv.classList.remove("chirpy-msg-loading");
          if (msg.code === "NO_API_KEY" || msg.code === "INVALID_API_KEY") {
            renderSetupForm(assistantDiv, highlightId, selText, messagesArea, msg.code);
          } else {
            assistantDiv.textContent = "Error: " + msg.error;
          }
          assistantDiv.classList.add("chirpy-msg-error");
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

  // ── Click on highlight to re-open bubble ──────────────────────────

  document.addEventListener("click", (e) => {
    const hlEl = e.target.closest("chirpy-hl");
    if (!hlEl) return;

    const id = hlEl.dataset.id;
    if (!id) return;

    // If bubble is already open for this highlight, do nothing
    if (currentHighlightId === id) return;

    // Show tooltip near the clicked highlight
    const rect = hlEl.getBoundingClientRect();
    showTooltip(rect.left + window.scrollX - 14, rect.top + window.scrollY - 40);

    if (!contextValid()) return;
    chrome.runtime.sendMessage({ type: "getHighlights", url: location.href }, (highlights) => {
      const hl = highlights?.find((h) => h.id === id);
      if (hl) {
        openBubble(id, hl.text, hl.messages || []);
      }
    });
  });

  // ── Click-outside dismissal ───────────────────────────────────────

  document.addEventListener("mousedown", (e) => {
    if (!currentHighlightId) return;
    const path = e.composedPath();
    // Check if click is inside bubble, tooltip, or a highlight
    const insideBubble = path.some((el) => el === bubbleHost);
    const insideTooltip = tooltip && path.some((el) => el === tooltip);
    const insideHighlight = e.target.closest?.("chirpy-hl");
    if (!insideBubble && !insideTooltip && !insideHighlight) {
      closeBubble();
    }
  });

  // ── Message listener for popup communication ──────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "scrollToHighlight") {
      const els = document.querySelectorAll(`chirpy-hl[data-id="${msg.id}"]`);
      if (els.length > 0) {
        els[0].scrollIntoView({ behavior: "smooth", block: "center" });
        // Flash yellow briefly
        for (const el of els) {
          const origBg = el.style.backgroundColor;
          el.style.backgroundColor = "rgba(250, 204, 21, 0.7)";
          el.style.transition = "background-color 0.3s";
          setTimeout(() => {
            el.style.backgroundColor = origBg;
          }, 800);
        }
      }
      // Open the chat bubble for this highlight
      if (contextValid() && currentHighlightId !== msg.id) {
        chrome.runtime.sendMessage({ type: "getHighlights", url: location.href }, (highlights) => {
          const hl = highlights?.find((h) => h.id === msg.id);
          if (hl) openBubble(msg.id, hl.text, hl.messages || []);
        });
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "openPageChat") {
      openPageChat();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "removeHighlightFromPage") {
      // Close bubble if open for this highlight
      if (currentHighlightId === msg.id) {
        closeBubble();
      }
      // Unwrap all <chirpy-hl> elements for that ID
      const els = document.querySelectorAll(`chirpy-hl[data-id="${msg.id}"]`);
      for (const el of els) {
        const parent = el.parentNode;
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
        parent.normalize();
      }
      sendResponse({ ok: true });
      return;
    }
  });

  // ── Init ──────────────────────────────────────────────────────────

  restoreHighlights();
  // Retry after delay for dynamic pages / late service-worker startup
  setTimeout(restoreHighlights, 1500);
})();
