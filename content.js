(() => {
  // ── Color System ──────────────────────────────────────────────────

  const COLORS = {
    amber:  { bg: "rgba(245, 158, 11, 0.3)", border: "rgba(245, 158, 11, 0.6)", hover: "rgba(245, 158, 11, 0.5)", solid: "#f59e0b" },
    blue:   { bg: "rgba(59, 130, 246, 0.3)",  border: "rgba(59, 130, 246, 0.6)",  hover: "rgba(59, 130, 246, 0.5)",  solid: "#3b82f6" },
    green:  { bg: "rgba(34, 197, 94, 0.3)",   border: "rgba(34, 197, 94, 0.6)",   hover: "rgba(34, 197, 94, 0.5)",   solid: "#22c55e" },
    pink:   { bg: "rgba(236, 72, 153, 0.3)",  border: "rgba(236, 72, 153, 0.6)",  hover: "rgba(236, 72, 153, 0.5)",  solid: "#ec4899" },
    purple: { bg: "rgba(168, 85, 247, 0.3)",  border: "rgba(168, 85, 247, 0.6)",  hover: "rgba(168, 85, 247, 0.5)",  solid: "#a855f7" },
    red:    { bg: "rgba(239, 68, 68, 0.3)",   border: "rgba(239, 68, 68, 0.6)",   hover: "rgba(239, 68, 68, 0.5)",   solid: "#ef4444" },
  };

  const DEFAULT_COLOR = "amber";

  /** Check if the extension context is still valid (survives extension reload) */
  function contextValid() {
    try { return !!chrome.runtime?.id; } catch { return false; }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  function generateId() {
    return "chirpy-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  /** Build an XPath for a text node */
  function getXPath(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentNode;
      const siblings = Array.from(parent.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
      const idx = siblings.indexOf(node) + 1;
      return getXPath(parent) + "/text()[" + idx + "]";
    }
    if (node === document.body) return "/html/body";
    const parent = node.parentNode;
    const siblings = Array.from(parent.children).filter((n) => n.tagName === node.tagName);
    const idx = siblings.indexOf(node) + 1;
    const tag = node.tagName.toLowerCase();
    return getXPath(parent) + "/" + tag + "[" + idx + "]";
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

  /** Get truncated page text for context */
  function getPageContext() {
    const text = document.body.innerText || "";
    return text.slice(0, 8000);
  }

  // ── Tooltip (appears on text selection) ────────────────────────────

  let tooltip = null;

  function removeTooltip() {
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
  }

  function showTooltip(x, y, selection) {
    removeTooltip();
    tooltip = document.createElement("div");
    tooltip.className = "chirpy-tooltip";

    // "Ask Chirpy" label — clicking highlights with default amber
    const label = document.createElement("span");
    label.className = "chirpy-tooltip-label";
    label.textContent = "Ask Chirpy";
    label.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const selText = selection.toString();
      const range = selection.getRangeAt(0);
      highlightRange(range, selText, DEFAULT_COLOR);
      removeTooltip();
    });
    tooltip.appendChild(label);

    // Color dots
    for (const [name, c] of Object.entries(COLORS)) {
      const dot = document.createElement("span");
      dot.className = "chirpy-color-dot";
      dot.style.background = c.solid;
      dot.title = name;
      dot.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const selText = selection.toString();
        const range = selection.getRangeAt(0);
        highlightRange(range, selText, name);
        removeTooltip();
      });
      tooltip.appendChild(dot);
    }

    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
    document.body.appendChild(tooltip);
  }

  document.addEventListener("mouseup", (e) => {
    // Small delay to let selection finalize
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        removeTooltip();
        return;
      }

      // Don't show tooltip if click is inside our bubble
      if (e.target.closest?.("chirpy-bubble-host")) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - 80 + window.scrollX;
      const y = rect.top - 36 + window.scrollY;
      showTooltip(x, y, sel);
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (tooltip && !tooltip.contains(e.target)) {
      removeTooltip();
    }
  });

  // ── Highlighting ──────────────────────────────────────────────────

  /** Wrap a Range in <chirpy-hl> elements and persist */
  function highlightRange(range, selText, color) {
    const id = generateId();
    color = color || DEFAULT_COLOR;

    // Serialize range before modifying DOM
    const serialized = {
      id,
      text: selText,
      color,
      startXPath: getXPath(range.startContainer),
      startOffset: range.startOffset,
      endXPath: getXPath(range.endContainer),
      endOffset: range.endOffset,
      messages: [],
    };

    wrapRangeInHighlight(range, id, color);
    window.getSelection().removeAllRanges();

    // Persist, then open bubble with auto-context
    if (!contextValid()) return;
    chrome.runtime.sendMessage(
      {
        type: "saveHighlight",
        url: location.href,
        highlight: serialized,
      },
      () => {
        openBubble(id, selText, [], color);
        // Auto-ask for context
        const messagesArea = bubbleShadow?.querySelector(".chirpy-messages");
        if (messagesArea) {
          sendMessage(id, selText, "Give me a couple sentences of context about this text.", messagesArea, { hidden: true });
        }
      }
    );
  }

  /** Wraps the given range's text nodes in <chirpy-hl> custom elements */
  function wrapRangeInHighlight(range, id, color) {
    color = color || DEFAULT_COLOR;
    const c = COLORS[color] || COLORS[DEFAULT_COLOR];

    // Collect text nodes in the range
    const textNodes = [];
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
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
      hl.dataset.color = color;
      hl.style.backgroundColor = c.bg;
      hl.style.borderBottom = "2px solid " + c.border;

      // Hover handlers
      hl.addEventListener("mouseenter", () => {
        hl.style.backgroundColor = c.hover;
      });
      hl.addEventListener("mouseleave", () => {
        hl.style.backgroundColor = c.bg;
      });

      nodeRange.surroundContents(hl);
    }
  }

  // ── Restore highlights on page load ───────────────────────────────

  function restoreHighlights() {
    if (!contextValid()) return;
    chrome.runtime.sendMessage({ type: "getHighlights", url: location.href }, (highlights) => {
      if (!highlights || !highlights.length) return;

      for (const hl of highlights) {
        try {
          const startNode = resolveXPath(hl.startXPath);
          const endNode = resolveXPath(hl.endXPath);
          if (!startNode || !endNode) continue;

          const range = document.createRange();
          range.setStart(startNode, hl.startOffset);
          range.setEnd(endNode, hl.endOffset);
          wrapRangeInHighlight(range, hl.id, hl.color || DEFAULT_COLOR);
        } catch {
          // Range may no longer be valid if page content changed
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
    bubbleShadow = bubbleHost.attachShadow({ mode: "open" });

    // Load bubble styles into shadow DOM
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("bubble.css");
    bubbleShadow.appendChild(link);

    document.body.appendChild(bubbleHost);
  }

  function openBubble(highlightId, selText, messages, color) {
    ensureBubbleHost();
    currentHighlightId = highlightId;

    color = color || DEFAULT_COLOR;
    const c = COLORS[color] || COLORS[DEFAULT_COLOR];

    // Clear previous bubble content (keep <link>)
    const existing = bubbleShadow.querySelector(".chirpy-bubble");
    if (existing) existing.remove();

    // Remove any previous dynamic theme style
    const oldStyle = bubbleShadow.querySelector("#chirpy-theme-style");
    if (oldStyle) oldStyle.remove();

    // Inject dynamic color theme
    const themeStyle = document.createElement("style");
    themeStyle.id = "chirpy-theme-style";
    themeStyle.textContent = `
      .chirpy-msg-user { background: ${c.solid}; }
      .chirpy-send { background: ${c.solid}; }
      .chirpy-send:hover { background: ${c.border}; }
      .chirpy-input:focus { border-color: ${c.solid}; box-shadow: 0 0 0 2px ${c.bg}; }
    `;
    bubbleShadow.appendChild(themeStyle);

    const bubble = document.createElement("div");
    bubble.className = "chirpy-bubble";

    // Header
    const header = document.createElement("div");
    header.className = "chirpy-header";
    header.style.background = c.solid;

    const title = document.createElement("span");
    title.className = "chirpy-title";
    title.textContent = selText.length > 60 ? selText.slice(0, 57) + "..." : selText;
    title.title = selText;

    const closeBtn = document.createElement("button");
    closeBtn.className = "chirpy-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", () => closeBubble());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Messages area
    const messagesArea = document.createElement("div");
    messagesArea.className = "chirpy-messages";

    // Render existing messages
    for (const m of messages) {
      appendMessage(messagesArea, m.role, m.content);
    }

    // Input bar
    const inputBar = document.createElement("div");
    inputBar.className = "chirpy-input-bar";

    const input = document.createElement("input");
    input.className = "chirpy-input";
    input.type = "text";
    input.placeholder = "Ask about this text...";

    const sendBtn = document.createElement("button");
    sendBtn.className = "chirpy-send";
    sendBtn.textContent = "Send";

    function handleSend() {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendMessage(highlightId, selText, text, messagesArea);
    }

    sendBtn.addEventListener("click", handleSend);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSend();
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

  // ── Chat messaging ────────────────────────────────────────────────

  function sendMessage(highlightId, selText, userText, messagesArea, { hidden = false } = {}) {
    if (!contextValid()) return;
    // Get current stored messages for this highlight
    chrome.runtime.sendMessage({ type: "getHighlights", url: location.href }, (highlights) => {
      const hl = highlights?.find((h) => h.id === highlightId);
      const chatMessages = hl?.messages || [];

      chatMessages.push({ role: "user", content: userText });
      if (!hidden) appendMessage(messagesArea, "user", userText);

      // Create assistant message placeholder
      const assistantDiv = appendMessage(messagesArea, "assistant", "");

      // Open port for streaming
      const port = chrome.runtime.connect({ name: "chirpy-chat" });

      port.postMessage({
        type: "chat",
        selection: selText,
        pageContext: getPageContext(),
        messages: chatMessages,
      });

      let assistantText = "";

      port.onMessage.addListener((msg) => {
        if (msg.type === "delta") {
          assistantText += msg.text;
          // Re-render markdown on each delta
          assistantDiv.innerHTML = renderMarkdown(assistantText);
          messagesArea.scrollTop = messagesArea.scrollHeight;
        } else if (msg.type === "done") {
          if (assistantText) {
            chatMessages.push({ role: "assistant", content: assistantText });
            // Final render
            assistantDiv.innerHTML = renderMarkdown(assistantText);
          }
          // Persist updated messages
          if (hl) {
            hl.messages = chatMessages;
            chrome.runtime.sendMessage({
              type: "updateHighlight",
              url: location.href,
              highlight: hl,
            });
          }
          port.disconnect();
        } else if (msg.type === "error") {
          assistantDiv.textContent = "Error: " + msg.error;
          assistantDiv.classList.add("chirpy-msg-error");
          port.disconnect();
        }
      });
    });
  }

  // ── Click on highlight to re-open bubble ──────────────────────────

  document.addEventListener("click", (e) => {
    const hlEl = e.target.closest("chirpy-hl");
    if (!hlEl) return;

    const id = hlEl.dataset.id;
    if (!id) return;

    // If bubble is already open for this highlight, do nothing
    if (currentHighlightId === id) return;

    if (!contextValid()) return;
    chrome.runtime.sendMessage({ type: "getHighlights", url: location.href }, (highlights) => {
      const hl = highlights?.find((h) => h.id === id);
      if (hl) {
        openBubble(id, hl.text, hl.messages || [], hl.color || DEFAULT_COLOR);
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
})();
