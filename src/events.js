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

// ── Selection & tooltip event handlers ────────────────────────────

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

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && currentHighlightId) {
    closeBubble();
    return;
  }
  if (!currentHighlightId) removeTooltip();
});

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
