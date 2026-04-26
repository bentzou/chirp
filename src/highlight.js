// ── Highlighting ──────────────────────────────────────────────────

/** IDs already restored — prevents double-wrapping on retry */
var restoredIds = new Set();

/** Wraps the given range's text nodes in <chirp-hl> custom elements */
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

    const hl = document.createElement("chirp-hl");
    hl.dataset.id = id;
    hl.style.backgroundColor = CHIRP_COLOR.bg;
    hl.style.borderBottom = "2px solid " + CHIRP_COLOR.border;

    hl.addEventListener("mouseenter", () => {
      if (chirpEnabled) hl.style.backgroundColor = CHIRP_COLOR.hover;
    });
    hl.addEventListener("mouseleave", () => {
      if (chirpEnabled) hl.style.backgroundColor = CHIRP_COLOR.bg;
    });

    nodeRange.surroundContents(hl);
  }
}

/** Wrap a Range in <chirp-hl> elements and persist */
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

  // Open bubble with onReady callback to guarantee DOM exists before sending
  openBubble(id, selText, serialized.messages, (messagesArea) => {
    if (startXPath && endXPath) {
      chrome.runtime.sendMessage({
        type: "saveHighlight",
        url: location.href,
        highlight: serialized,
      }, (response) => {
        if (response?.ok) {
          sendMessage(id, selText, "In 1-2 sentences, explain this and relate it to the page if relevant.", messagesArea, { hidden: true });
        }
      });
    } else {
      sendMessage(id, selText, "In 1-2 sentences, explain this and relate it to the page if relevant.", messagesArea, { hidden: true });
    }
  }, serialized);
}

// ── Restore highlights on page load ───────────────────────────────

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
