// ── Tooltip (appears on text selection) ────────────────────────────

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
  if (e.data?.type !== "chirp-tooltip-click" || !tooltipAction) return;
  const fn = tooltipAction;
  tooltipAction = null;
  removeTooltip();
  try { fn(); } catch (err) { console.error("[Chirp] highlightRange failed:", err); }
});

function showTooltip(x, y, selection) {
  // Capture selection data eagerly — the live Selection object can be
  // cleared by the host page's JS before the user clicks the tooltip.
  let selText, range;
  if (selection && !selection.isCollapsed) {
    selText = selection.toString();
    try { range = selection.getRangeAt(0).cloneRange(); } catch (_) {}
  }

  // If tooltip already exists, just update the action without touching
  // the DOM — avoids blink when selection expands (double → triple click).
  if (tooltip) {
    if (selText && range) {
      tooltipAction = () => highlightRange(range, selText);
    }
    return;
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

// ── Selection & tooltip event handlers ────────────────────────────

document.addEventListener("mouseup", (e) => {
  if (!chirpEnabled) return;
  // Small delay to let selection finalize
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      if (!currentHighlightId && !e.target.closest?.("chirp-hl") && !(tooltip && tooltip === e.target)) removeTooltip();
      return;
    }

    // Don't show tooltip if click is inside our bubble
    if (e.target.closest?.("chirp-bubble-host")) return;

    const x = e.pageX - 14;
    const y = e.pageY - 40;
    showTooltip(x, y, sel);
  }, 10);
});

document.addEventListener("mousedown", (e) => {
  if (e.detail >= 2) return; // Don't remove on multi-click (prevents tooltip blink on triple-click)
  if (tooltip && e.target !== tooltip && !currentHighlightId && !e.target.closest?.("chirp-hl")) {
    removeTooltip();
  }
});

// ── Keyboard shortcut (capture phase to beat site handlers) ────────
document.addEventListener("keydown", (e) => {
  if (e.altKey && e.key === "c" && !e.ctrlKey && !e.metaKey && chirpEnabled) {
    e.preventDefault();
    e.stopImmediatePropagation();
    openPageChat();
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && currentHighlightId) {
    if (activeStreamStop) {
      stopStreaming();
    } else {
      closeBubble();
    }
    return;
  }
  if (!currentHighlightId && !e.shiftKey) removeTooltip();
});

document.addEventListener("keyup", () => {
  if (!tooltip) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) {
    removeTooltip();
  } else {
    // Update action with current selection (user may have extended it with Shift+Arrow)
    showTooltip(0, 0, sel);
  }
});

// ── Click on highlight to re-open bubble ──────────────────────────

document.addEventListener("click", (e) => {
  const hlEl = e.target.closest("chirp-hl");
  if (!hlEl) return;

  const id = hlEl.dataset.id;
  if (!id) return;

  // If bubble is already open for this highlight, do nothing
  if (currentHighlightId === id) return;

  removeTooltip();

  if (!contextValid()) return;
  chrome.runtime.sendMessage({ type: "getHighlights", url: location.href }, (highlights) => {
    const hl = highlights?.find((h) => h.id === id);
    if (hl) {
      openBubble(id, hl.text, hl.messages || []);
    }
  });
});

// ── Click-outside dismissal ───────────────────────────────────────


// ── Message listener for popup communication ──────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "scrollToHighlight") {
    const els = document.querySelectorAll(`chirp-hl[data-id="${msg.id}"]`);
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
    // Unwrap all <chirp-hl> elements for that ID
    const els = document.querySelectorAll(`chirp-hl[data-id="${msg.id}"]`);
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
