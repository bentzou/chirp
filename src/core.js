// ── Chirp highlight color ────────────────────────────────────────

const CHIRP_COLOR = {
  bg: "rgba(245, 158, 11, 0.35)",
  border: "rgba(245, 158, 11, 0.6)",
  hover: "rgba(245, 158, 11, 0.5)",
  solid: "#f59e0b",
};

// ── Shared state ─────────────────────────────────────────────────
// Declared here (first-loaded file) so every later script can
// reference them without TDZ issues.

const PAGE_CHAT_ID = "chirp-page-chat";
var pageChatMessages = [];

var chirpEnabled = true;
var bubbleHost = null;
var bubbleShadow = null;
var currentHighlightId = null;
var tooltip = null;
var tooltipAction = null;
var activePort = null;
var activeStreamStop = null;

// ── Enabled state ────────────────────────────────────────────────

chrome.storage.sync.get({ enabled: true }, (data) => {
  chirpEnabled = data.enabled;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) {
    chirpEnabled = changes.enabled.newValue;
    toggleHighlightsVisibility(chirpEnabled);
  }
});

function toggleHighlightsVisibility(visible) {
  document.querySelectorAll("chirp-hl").forEach((el) => {
    el.style.backgroundColor = visible ? CHIRP_COLOR.bg : "transparent";
    el.style.borderBottom = visible ? "2px solid " + CHIRP_COLOR.border : "none";
    el.style.pointerEvents = visible ? "" : "none";
  });
  if (!visible) {
    removeTooltip();
    closeBubble();
  }
}

// ── Helpers ────────────────────────────────────────────────────────

/** Check if the extension context is still valid (survives extension reload) */
function contextValid() {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

function generateId() {
  return "chirp-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
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

// ── Markdown rendering ────────────────────────────────────────────
// purify.js and marked.js are loaded as content scripts before this file,
// so `DOMPurify` and `marked` are available directly in the isolated world.

if (typeof marked !== "undefined") {
  marked.setOptions({ breaks: true });
}

function renderMarkdown(text) {
  if (typeof marked !== "undefined") {
    return DOMPurify.sanitize(marked.parse(text));
  }
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
