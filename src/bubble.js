// ── Bubble Chat UI (Shadow DOM) ───────────────────────────────────

const SEND_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>';
const STOP_ICON = '<svg class="chirp-spin" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>';
const COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const EDIT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const CHEVRON_LEFT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
const CHEVRON_RIGHT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>';

let bubbleStylesReady = false;
let userAtBottom = true;

function attachAutoResize(el, max) {
  function resize() {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }
  el.addEventListener("input", resize);
  return resize;
}

function projectForStorage(msgs) {
  return msgs.map(({ role, content, hidden, versions, activeVersion }) => {
    const out = { role, content };
    if (hidden) out.hidden = true;
    if (versions) {
      out.versions = versions.slice();
      out.activeVersion = activeVersion;
    }
    return out;
  });
}

function initResize(bubble) {
  const MIN_W = 280;
  const MIN_H = 200;

  // dirW/dirH: +1 = dragging grows toward positive screen coords, -1 = opposite
  function startResize(e, dirW, dirH) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = bubble.offsetWidth;
    const startH = bubble.offsetHeight;

    function onMove(ev) {
      if (dirW) {
        const w = Math.max(MIN_W, startW + dirW * (ev.clientX - startX));
        bubble.style.width = w + "px";
      }
      if (dirH) {
        const h = Math.max(MIN_H, startH + dirH * (ev.clientY - startY));
        bubble.style.maxHeight = "none";
        bubble.style.height = h + "px";
      }
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Edges
  bubble.querySelector(".chirp-resize-left").addEventListener("mousedown", (e) => startResize(e, -1, 0));
  bubble.querySelector(".chirp-resize-right").addEventListener("mousedown", (e) => startResize(e, +1, 0));
  bubble.querySelector(".chirp-resize-top").addEventListener("mousedown", (e) => startResize(e, 0, -1));
  bubble.querySelector(".chirp-resize-bottom").addEventListener("mousedown", (e) => startResize(e, 0, +1));
  // Corners
  bubble.querySelector(".chirp-resize-tl").addEventListener("mousedown", (e) => startResize(e, -1, -1));
  bubble.querySelector(".chirp-resize-tr").addEventListener("mousedown", (e) => startResize(e, +1, -1));
  bubble.querySelector(".chirp-resize-bl").addEventListener("mousedown", (e) => startResize(e, -1, +1));
  bubble.querySelector(".chirp-resize-br").addEventListener("mousedown", (e) => startResize(e, +1, +1));
}

function initDrag(bubble, header) {
  const DEAD_ZONE = 5;
  const SNAP_THRESHOLD = 60;
  const GAP = 20;
  let didDrag = false;

  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    if (bubble.classList.contains("chirp-expanded")) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = bubble.getBoundingClientRect();
    let dragging = false;
    didDrag = false;

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (!dragging) {
        if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return;
        dragging = true;
        ev.preventDefault();
        didDrag = true;
        bubble.classList.add("chirp-dragging");
        // Switch to top/left positioning for free movement
        bubble.style.top = rect.top + "px";
        bubble.style.left = rect.left + "px";
        bubble.style.bottom = "auto";
        bubble.style.right = "auto";
      }

      bubble.style.top = (rect.top + dy) + "px";
      bubble.style.left = (rect.left + dx) + "px";
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);

      if (!dragging) return; // click — let the click handler fire

      bubble.classList.remove("chirp-dragging");
      snapToEdges(bubble);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // Suppress click (minimize) when a drag occurred
  header.addEventListener("click", (e) => {
    if (didDrag) {
      e.stopImmediatePropagation();
      didDrag = false;
    }
  }, true); // capture phase to fire before the existing click handler

  function snapToEdges(el) {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Determine closest horizontal edge
    const distLeft = r.left;
    const distRight = vw - r.right;
    const useLeft = distLeft <= distRight;

    // Determine closest vertical edge
    const distTop = r.top;
    const distBottom = vh - r.bottom;
    const useTop = distTop <= distBottom;

    // Compute snapped position
    const snapLeft = useLeft
      ? (distLeft < SNAP_THRESHOLD ? GAP : r.left)
      : null;
    const snapRight = !useLeft
      ? (distRight < SNAP_THRESHOLD ? GAP : vw - r.right)
      : null;
    const snapTop = useTop
      ? (distTop < SNAP_THRESHOLD ? GAP : r.top)
      : null;
    const snapBottom = !useTop
      ? (distBottom < SNAP_THRESHOLD ? GAP : vh - r.bottom)
      : null;

    // Apply snap with transition
    el.classList.add("chirp-snapping");

    if (useLeft) {
      el.style.left = snapLeft + "px";
      el.style.right = "auto";
    } else {
      el.style.right = snapRight + "px";
      el.style.left = "auto";
    }
    if (useTop) {
      el.style.top = snapTop + "px";
      el.style.bottom = "auto";
    } else {
      el.style.bottom = snapBottom + "px";
      el.style.top = "auto";
    }

    el.addEventListener("transitionend", () => {
      el.classList.remove("chirp-snapping");
    }, { once: true });

    // Fallback removal if no transition fires
    setTimeout(() => el.classList.remove("chirp-snapping"), 200);
  }
}

function ensureBubbleHost() {
  if (bubbleHost) return;
  bubbleHost = document.createElement("chirp-bubble-host");
  bubbleHost.style.cssText = "display:contents;pointer-events:auto;visibility:visible;opacity:1;";
  bubbleShadow = bubbleHost.attachShadow({ mode: "open" });

  // Load bubble styles into shadow DOM
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("bubble.css");
  link.addEventListener("load", () => { bubbleStylesReady = true; });
  bubbleShadow.appendChild(link);

  document.body.appendChild(bubbleHost);
}

function openBubble(highlightId, selText, messages, onReady, hl) {
  ensureBubbleHost();

  // Defer until stylesheet is loaded to prevent FOUC
  if (!bubbleStylesReady) {
    bubbleShadow.querySelector("link").addEventListener("load", () => {
      openBubble(highlightId, selText, messages, onReady, hl);
    }, { once: true });
    return;
  }

  currentHighlightId = highlightId;

  // Clear previous bubble content (keep <link>)
  const existing = bubbleShadow.querySelector(".chirp-bubble");
  if (existing) existing.remove();

  const bubble = document.createElement("div");
  bubble.className = "chirp-bubble";

  // Resize handles on all edges and corners
  for (const cls of ["chirp-resize-left", "chirp-resize-right", "chirp-resize-top", "chirp-resize-bottom", "chirp-resize-tl", "chirp-resize-tr", "chirp-resize-bl", "chirp-resize-br"]) {
    const handle = document.createElement("div");
    handle.className = cls;
    bubble.appendChild(handle);
  }
  initResize(bubble);

  // Header
  const header = document.createElement("div");
  header.className = "chirp-header";

  const logo = document.createElement("img");
  logo.className = "chirp-logo";
  logo.src = chrome.runtime.getURL("icons/icon48.png");
  logo.alt = "";

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
      bubble.style.width = "";
      bubble.style.height = "";
      bubble.style.maxHeight = "";
      bubble.style.top = "";
      bubble.style.left = "";
      bubble.style.bottom = "";
      bubble.style.right = "";
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

  // Logo menu
  function closeMenu() {
    const m = bubble.querySelector(".chirp-menu");
    if (m) m.remove();
  }

  function openMenu() {
    if (bubble.querySelector(".chirp-menu")) { closeMenu(); return; }

    const menuEl = document.createElement("div");
    menuEl.className = "chirp-menu";

    const clearBtn = document.createElement("button");
    clearBtn.className = "chirp-menu-action";
    clearBtn.textContent = "Clear conversation";
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenu();
      const isPageChat = highlightId === PAGE_CHAT_ID;
      if (isPageChat) {
        pageChatMessages.length = 0;
        chrome.runtime.sendMessage({ type: "savePageChat", url: location.href, messages: [] });
      }
      while (messagesArea.firstChild) messagesArea.firstChild.remove();
      const empty = document.createElement("div");
      empty.className = "chirp-empty";
      empty.textContent = isPageChat
        ? "Chirp!"
        : "Ask a question about this text\u2026";
      messagesArea.appendChild(empty);
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "chirp-menu-action";
    copyBtn.textContent = "Copy conversation";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const msgs = messagesArea.querySelectorAll(".chirp-msg");
      const lines = [];
      for (const m of msgs) {
        const role = m.classList.contains("chirp-msg-user") ? "You" : "Chirp";
        lines.push(role + ": " + m.textContent.trim());
      }
      navigator.clipboard.writeText(lines.join("\n"));
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy conversation"; }, 1200);
    });

    menuEl.appendChild(clearBtn);
    menuEl.appendChild(copyBtn);

    bubble.appendChild(menuEl);

    function onOutsideClick(ev) {
      const m = bubble.querySelector(".chirp-menu");
      if (m && !m.contains(ev.target) && ev.target !== logo && !logo.contains(ev.target)) {
        closeMenu();
        bubble.removeEventListener("mousedown", onOutsideClick, true);
      }
    }
    bubble.addEventListener("mousedown", onOutsideClick, true);
  }

  logo.addEventListener("click", (e) => {
    e.stopPropagation();
    openMenu();
  });
  logo.style.cursor = "pointer";

  header.addEventListener("click", (e) => {
    if (e.target.closest("button") || e.target === logo) return;
    if (bubble.querySelector(".chirp-menu")) { closeMenu(); return; }
    setBubbleState("minimized");
  });

  initDrag(bubble, header);

  header.appendChild(logo);
  header.appendChild(title);
  header.appendChild(minBtn);
  header.appendChild(expandBtn);
  header.appendChild(closeBtn);

  // Messages area
  const messagesArea = document.createElement("div");
  messagesArea.className = "chirp-messages";

  messagesArea.addEventListener("scroll", () => {
    const threshold = 40;
    userAtBottom =
      messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight < threshold;
  });

  messagesArea._chirpMessages = messages;
  const initialIsPageChat = highlightId === PAGE_CHAT_ID;
  messagesArea._chirpReplyCtx = { isPageChat: initialIsPageChat, hl: hl || null, highlightId, selText, sendBtn: null };

  // Render existing messages (skip hidden auto-asks)
  for (const m of messages) {
    if (m.hidden) continue;
    appendMessage(messagesArea, m.role, m.content, m);
  }
  refreshMessageStates(messagesArea);

  // Empty state when no visible messages
  if (!messages.some(m => !m.hidden)) {
    const empty = document.createElement("div");
    empty.className = "chirp-empty";
    empty.textContent = highlightId === PAGE_CHAT_ID
      ? "Chirp!"
      : "Ask a question about this text\u2026";
    messagesArea.appendChild(empty);
  }

  // Input bar
  const inputBar = document.createElement("div");
  inputBar.className = "chirp-input-bar";

  const input = document.createElement("textarea");
  input.className = "chirp-input";
  input.rows = 2;
  input.placeholder = "Ask about this text...";

  const autoResize = attachAutoResize(input, 120);

  const sendBtn = document.createElement("button");
  sendBtn.className = "chirp-send";
  sendBtn.innerHTML = SEND_ICON;
  messagesArea._chirpReplyCtx.sendBtn = sendBtn;

  function handleSend() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    autoResize();
    sendMessage(highlightId, selText, text, messagesArea, { sendBtn });
  }

  sendBtn.addEventListener("click", () => {
    if (sendBtn.classList.contains("chirp-stop")) {
      stopStreaming();
    } else {
      handleSend();
    }
  });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      if (bubble.querySelector(".chirp-menu")) { closeMenu(); return; }
      if (activeStreamStop) {
        stopStreaming();
      } else {
        closeBubble();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  const inputWrap = document.createElement("div");
  inputWrap.className = "chirp-input-wrap";
  inputWrap.appendChild(input);
  inputWrap.appendChild(sendBtn);
  inputBar.appendChild(inputWrap);

  bubble.appendChild(header);
  bubble.appendChild(messagesArea);
  bubble.appendChild(inputBar);
  bubbleShadow.appendChild(bubble);
  if (onReady) onReady(messagesArea);

  // Scroll messages to bottom and focus input
  setTimeout(() => {
    messagesArea.scrollTop = messagesArea.scrollHeight;
    userAtBottom = true;
    input.focus();
  }, 50);
}

function closeBubble() {
  stopStreaming();
  const closingId = currentHighlightId;
  if (!bubbleShadow) return;
  const existing = bubbleShadow.querySelector(".chirp-bubble");
  if (existing) existing.remove();
  currentHighlightId = null;
  removeTooltip();

  // If closing a highlight with no assistant replies, remove it entirely
  if (closingId && closingId !== PAGE_CHAT_ID && contextValid()) {
    chrome.runtime.sendMessage({ type: "getHighlights", url: location.href }, (highlights) => {
      const hl = highlights?.find((h) => h.id === closingId);
      if (hl && !hl.messages?.some((m) => m.role === "assistant")) {
        chrome.runtime.sendMessage({ type: "deleteHighlight", url: location.href, id: closingId });
        const els = document.querySelectorAll(`chirp-hl[data-id="${closingId}"]`);
        for (const el of els) {
          const parent = el.parentNode;
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
          parent.normalize();
        }
      }
    });
  }
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
  if (!contextValid()) return;
  chrome.runtime.sendMessage({ type: "getPageChat", url: location.href }, (stored) => {
    pageChatMessages.length = 0;
    if (stored?.length) pageChatMessages.push(...stored);
    openBubble(PAGE_CHAT_ID, "Page Chat", pageChatMessages);
    if (bubbleShadow) {
      const input = bubbleShadow.querySelector(".chirp-input");
      if (input) input.placeholder = "Ask about this page...";
    }
  });
}

function appendMessage(container, role, content, msg) {
  const empty = container.querySelector(".chirp-empty");
  if (empty) empty.remove();

  const div = document.createElement("div");
  div.className = "chirp-msg chirp-msg-" + role;
  if (msg) div._chirpMsg = msg;

  const contentEl = document.createElement("div");
  contentEl.className = "chirp-msg-content";
  if (content) {
    contentEl.innerHTML = renderMarkdown(content);
  }
  div.appendChild(contentEl);

  const copyBtn = document.createElement("button");
  copyBtn.className = "chirp-copy-btn";
  copyBtn.innerHTML = COPY_ICON;
  copyBtn.title = "Copy message";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(contentEl.textContent.trim()).then(() => {
      copyBtn.innerHTML = CHECK_ICON;
      copyBtn.classList.add("chirp-copied");
      setTimeout(() => {
        copyBtn.innerHTML = COPY_ICON;
        copyBtn.classList.remove("chirp-copied");
      }, 1200);
    });
  });
  div.appendChild(copyBtn);

  if (role === "user") {
    const editBtn = document.createElement("button");
    editBtn.className = "chirp-edit-btn";
    editBtn.innerHTML = EDIT_ICON;
    editBtn.title = "Edit message";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      enterEditMode(div);
    });
    div.appendChild(editBtn);
  }

  container.appendChild(div);
  if (userAtBottom) container.scrollTop = container.scrollHeight;
  return div;
}

// ── Edit / re-roll / version pager ────────────────────────────────

function getMessagesArea(div) {
  return div.closest(".chirp-messages");
}

function getChatMessagesFor(messagesArea) {
  // Every rendered message div carries _chirpMsg; the chatMessages array is
  // the one those refs live in. We can't infer it from the DOM alone, so the
  // bubble stores it on the messages container.
  return messagesArea?._chirpMessages || null;
}

function getReplyContext(messagesArea) {
  return messagesArea?._chirpReplyCtx || null;
}

function findUserDivIndex(messagesArea, userDiv) {
  const chatMessages = getChatMessagesFor(messagesArea);
  if (!chatMessages) return -1;
  const target = userDiv._chirpMsg;
  for (let i = 0; i < chatMessages.length; i++) {
    if (chatMessages[i] === target) return i;
  }
  return -1;
}

function pairedAssistantDiv(userDiv) {
  let next = userDiv.nextElementSibling;
  while (next && next.classList.contains("chirp-pager")) next = next.nextElementSibling;
  if (next && next.classList.contains("chirp-msg-assistant")) return next;
  return null;
}

function isLastNonHiddenUser(messagesArea, userDiv) {
  const allUsers = messagesArea.querySelectorAll(".chirp-msg-user");
  let lastVisible = null;
  for (const u of allUsers) {
    if (u._chirpMsg?.hidden) continue;
    lastVisible = u;
  }
  return lastVisible === userDiv;
}

function refreshMessageStates(messagesArea) {
  if (!messagesArea) return;
  const userDivs = messagesArea.querySelectorAll(".chirp-msg-user");
  for (const userDiv of userDivs) {
    const msg = userDiv._chirpMsg;
    if (!msg) continue;

    const isLast = !msg.hidden && isLastNonHiddenUser(messagesArea, userDiv);
    const assistantDiv = pairedAssistantDiv(userDiv);
    const assistantBlocked = assistantDiv && (
      assistantDiv.classList.contains("chirp-msg-loading") ||
      assistantDiv.querySelector(".chirp-setup-form")
    );
    const editing = userDiv.classList.contains("chirp-msg-editing");
    const rerolling = userDiv.classList.contains("chirp-msg-rerolling");

    if (isLast && !assistantBlocked && !editing && !rerolling) {
      userDiv.classList.add("chirp-msg-editable");
    } else {
      userDiv.classList.remove("chirp-msg-editable");
    }

    renderPagerFor(userDiv);
  }
}

function renderPagerFor(userDiv) {
  const msg = userDiv._chirpMsg;
  const versions = msg?.versions;
  const existing = userDiv._chirpPager;

  if (!versions || versions.length <= 1 || userDiv.classList.contains("chirp-msg-rerolling")) {
    if (existing) {
      existing.remove();
      userDiv._chirpPager = null;
    }
    return;
  }

  const active = msg.activeVersion ?? versions.length - 1;

  let pager = existing;
  if (!pager) {
    pager = document.createElement("div");
    pager.className = "chirp-pager";

    const prev = document.createElement("button");
    prev.className = "chirp-pager-btn chirp-pager-prev";
    prev.innerHTML = CHEVRON_LEFT_ICON;
    prev.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = userDiv._chirpMsg;
      if (!m?.versions) return;
      const cur = m.activeVersion ?? m.versions.length - 1;
      if (cur > 0) setActiveVersion(userDiv, cur - 1);
    });

    const label = document.createElement("span");
    label.className = "chirp-pager-label";

    const next = document.createElement("button");
    next.className = "chirp-pager-btn chirp-pager-next";
    next.innerHTML = CHEVRON_RIGHT_ICON;
    next.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = userDiv._chirpMsg;
      if (!m?.versions) return;
      const cur = m.activeVersion ?? m.versions.length - 1;
      if (cur < m.versions.length - 1) setActiveVersion(userDiv, cur + 1);
    });

    pager.appendChild(prev);
    pager.appendChild(label);
    pager.appendChild(next);

    userDiv.parentNode.insertBefore(pager, userDiv.nextSibling);
    userDiv._chirpPager = pager;
  }

  pager.querySelector(".chirp-pager-label").textContent = (active + 1) + " / " + versions.length;
  pager.querySelector(".chirp-pager-prev").disabled = active <= 0;
  pager.querySelector(".chirp-pager-next").disabled = active >= versions.length - 1;
}

function setActiveVersion(userDiv, newIndex) {
  const userMsg = userDiv._chirpMsg;
  if (!userMsg?.versions) return;
  if (newIndex < 0 || newIndex >= userMsg.versions.length) return;

  const assistantDiv = pairedAssistantDiv(userDiv);
  const assistantMsg = assistantDiv?._chirpMsg;

  userMsg.activeVersion = newIndex;
  userMsg.content = userMsg.versions[newIndex];
  const userContentEl = userDiv.querySelector(".chirp-msg-content");
  userContentEl.innerHTML = renderMarkdown(userMsg.content);

  if (assistantMsg && assistantMsg.versions) {
    assistantMsg.activeVersion = newIndex;
    assistantMsg.content = assistantMsg.versions[newIndex] ?? "";
    const aContentEl = assistantDiv.querySelector(".chirp-msg-content");
    aContentEl.innerHTML = assistantMsg.content ? renderMarkdown(assistantMsg.content) : "";
  }

  renderPagerFor(userDiv);

  const messagesArea = getMessagesArea(userDiv);
  persistChat(messagesArea);
}

function persistChat(messagesArea) {
  const ctx = getReplyContext(messagesArea);
  if (!ctx) return;
  const chatMessages = getChatMessagesFor(messagesArea);
  if (!chatMessages) return;
  if (ctx.isPageChat) {
    chrome.runtime.sendMessage({
      type: "savePageChat",
      url: location.href,
      messages: projectForStorage(chatMessages),
    });
  } else if (ctx.hl) {
    ctx.hl.messages = projectForStorage(chatMessages);
    chrome.runtime.sendMessage({
      type: "updateHighlight",
      url: location.href,
      highlight: ctx.hl,
    });
  }
}

function enterEditMode(userDiv) {
  if (userDiv.classList.contains("chirp-msg-editing")) return;
  const userMsg = userDiv._chirpMsg;
  if (!userMsg) return;

  userDiv.classList.add("chirp-msg-editing");

  const contentEl = userDiv.querySelector(".chirp-msg-content");
  contentEl.style.display = "none";

  const editor = document.createElement("div");
  editor.className = "chirp-edit-wrap";

  const ta = document.createElement("textarea");
  ta.className = "chirp-edit-textarea";
  ta.value = userMsg.content;
  ta.rows = 2;

  const actions = document.createElement("div");
  actions.className = "chirp-edit-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "chirp-edit-cancel";
  cancelBtn.innerHTML = CLOSE_ICON;
  cancelBtn.title = "Cancel";
  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exitEditMode(userDiv);
  });

  const submitBtn = document.createElement("button");
  submitBtn.className = "chirp-edit-submit";
  submitBtn.innerHTML = SEND_ICON;
  submitBtn.title = "Send";
  submitBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    commitEdit(userDiv, ta.value);
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);

  editor.appendChild(ta);
  editor.appendChild(actions);

  userDiv.appendChild(editor);
  userDiv._chirpEditor = editor;

  const resize = attachAutoResize(ta, 240);
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      exitEditMode(userDiv);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitEdit(userDiv, ta.value);
    }
  });

  refreshMessageStates(getMessagesArea(userDiv));

  setTimeout(() => {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    resize();
  }, 0);
}

function exitEditMode(userDiv) {
  const editor = userDiv._chirpEditor;
  if (editor) {
    editor.remove();
    userDiv._chirpEditor = null;
  }
  const contentEl = userDiv.querySelector(".chirp-msg-content");
  if (contentEl) contentEl.style.display = "";
  userDiv.classList.remove("chirp-msg-editing");
  refreshMessageStates(getMessagesArea(userDiv));
}

function commitEdit(userDiv, newText) {
  const trimmed = newText.trim();
  const userMsg = userDiv._chirpMsg;
  if (!userMsg) { exitEditMode(userDiv); return; }
  if (!trimmed || trimmed === userMsg.content) {
    exitEditMode(userDiv);
    return;
  }
  exitEditMode(userDiv);
  rerollLast(userDiv, trimmed);
}

function rerollLast(userDiv, newText) {
  const messagesArea = getMessagesArea(userDiv);
  const ctx = getReplyContext(messagesArea);
  const chatMessages = getChatMessagesFor(messagesArea);
  if (!ctx || !chatMessages) return;

  const userIdx = findUserDivIndex(messagesArea, userDiv);
  if (userIdx < 0) return;

  const userMsg = chatMessages[userIdx];
  let assistantDiv = pairedAssistantDiv(userDiv);
  let assistantMsg = assistantDiv?._chirpMsg || null;
  if (assistantMsg && assistantMsg.role !== "assistant") {
    assistantMsg = null;
    assistantDiv = null;
  }
  const assistantWasNew = !assistantMsg;

  if (activeStreamStop) activeStreamStop();

  // Snapshot prior state so we can roll back if re-roll is aborted before any text streams in.
  const priorUserContent = userMsg.content;
  const priorUserVersions = userMsg.versions ? userMsg.versions.slice() : null;
  const priorUserActive = userMsg.activeVersion ?? null;
  const priorAssistantContent = assistantMsg?.content ?? "";
  const priorAssistantVersions = assistantMsg?.versions ? assistantMsg.versions.slice() : null;
  const priorAssistantActive = assistantMsg?.activeVersion ?? null;

  if (!userMsg.versions) {
    userMsg.versions = [userMsg.content];
    userMsg.activeVersion = 0;
  }
  userMsg.versions.push(newText);
  userMsg.activeVersion = userMsg.versions.length - 1;
  userMsg.content = newText;

  const userContentEl = userDiv.querySelector(".chirp-msg-content");
  userContentEl.innerHTML = renderMarkdown(newText);

  userDiv.classList.add("chirp-msg-rerolling");
  renderPagerFor(userDiv);

  if (assistantMsg) {
    if (!assistantMsg.versions) {
      assistantMsg.versions = [assistantMsg.content || ""];
      assistantMsg.activeVersion = 0;
    }
    assistantMsg.versions.push("");
    assistantMsg.activeVersion = assistantMsg.versions.length - 1;
    assistantMsg.content = "";

    assistantDiv.classList.remove("chirp-msg-error");
    assistantDiv.classList.add("chirp-msg-loading");
    const aContent = assistantDiv.querySelector(".chirp-msg-content");
    aContent.innerHTML = "";
  } else {
    assistantMsg = { role: "assistant", content: "" };
    chatMessages.splice(userIdx + 1, 0, assistantMsg);
    assistantDiv = appendMessage(messagesArea, "assistant", "", assistantMsg);
    assistantDiv.classList.add("chirp-msg-loading");
  }

  refreshMessageStates(messagesArea);

  function rollback() {
    userMsg.content = priorUserContent;
    if (priorUserVersions) {
      userMsg.versions = priorUserVersions;
      userMsg.activeVersion = priorUserActive;
    } else {
      delete userMsg.versions;
      delete userMsg.activeVersion;
    }
    userContentEl.innerHTML = renderMarkdown(userMsg.content);

    if (assistantWasNew) {
      const idx = chatMessages.indexOf(assistantMsg);
      if (idx >= 0) chatMessages.splice(idx, 1);
      assistantDiv.remove();
      return;
    }

    if (priorAssistantVersions) {
      assistantMsg.versions = priorAssistantVersions;
      assistantMsg.activeVersion = priorAssistantActive;
      assistantMsg.content = priorAssistantContent;
    } else if (assistantMsg.versions) {
      delete assistantMsg.versions;
      delete assistantMsg.activeVersion;
      assistantMsg.content = priorAssistantContent;
    }
    const aContent = assistantDiv.querySelector(".chirp-msg-content");
    aContent.innerHTML = assistantMsg.content ? renderMarkdown(assistantMsg.content) : "";
  }

  function onDone(text) {
    if (assistantMsg.versions) {
      assistantMsg.versions[assistantMsg.activeVersion] = text;
    }
    assistantMsg.content = text;
  }

  function onAbort(partialText) {
    if (!partialText) {
      rollback();
    } else {
      onDone(partialText);
    }
  }

  function onSettle() {
    userDiv.classList.remove("chirp-msg-rerolling");
    refreshMessageStates(messagesArea);
  }

  streamInto({
    chatMessages,
    isPageChat: ctx.isPageChat,
    hl: ctx.hl,
    highlightId: ctx.highlightId,
    selText: ctx.selText,
    messagesArea,
    sendBtn: ctx.sendBtn,
    assistantDiv,
    onDone,
    onAbort,
    onSettle,
  });
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

function stopStreaming() {
  if (activeStreamStop) activeStreamStop();
}

function streamInto({
  chatMessages,
  isPageChat,
  hl,
  highlightId,
  selText,
  messagesArea,
  sendBtn,
  assistantDiv,
  onDone,
  onAbort,
  onSettle,
}) {
  if (activeStreamStop) activeStreamStop();
  const port = chrome.runtime.connect({ name: "chirp-chat" });
  activePort = port;
  let assistantText = "";
  let finished = false;

  if (sendBtn) {
    sendBtn.innerHTML = STOP_ICON;
    sendBtn.classList.add("chirp-stop");
  }

  function finish() {
    if (finished) return;
    finished = true;
    port.disconnect();
    if (activePort === port) activePort = null;
    if (activeStreamStop === stop) activeStreamStop = null;
    if (sendBtn) {
      sendBtn.innerHTML = SEND_ICON;
      sendBtn.classList.remove("chirp-stop");
    }
    if (onSettle) onSettle();
  }

  function persistOnDone() {
    if (assistantText && onDone) onDone(assistantText);
    if (isPageChat) {
      chrome.runtime.sendMessage({
        type: "savePageChat",
        url: location.href,
        messages: projectForStorage(chatMessages),
      });
    } else if (hl && assistantText) {
      hl.messages = projectForStorage(chatMessages);
      chrome.runtime.sendMessage({
        type: "updateHighlight",
        url: location.href,
        highlight: hl,
      });
    }
  }

  function stop() {
    assistantDiv.classList.remove("chirp-msg-loading");
    if (onAbort) onAbort(assistantText);
    if (assistantText) {
      if (isPageChat) {
        chrome.runtime.sendMessage({
          type: "savePageChat",
          url: location.href,
          messages: projectForStorage(chatMessages),
        });
      } else if (hl) {
        hl.messages = projectForStorage(chatMessages);
        chrome.runtime.sendMessage({
          type: "updateHighlight",
          url: location.href,
          highlight: hl,
        });
      }
    }
    finish();
  }

  activeStreamStop = stop;

  port.onDisconnect.addListener(() => {
    if (!finished) stop();
  });

  port.postMessage({
    type: "chat",
    mode: isPageChat ? "page-chat" : "highlight",
    selection: selText,
    pageContext: getPageContext(),
    messages: chatMessages.map(({ role, content }) => ({ role, content })),
  });

  const assistantContent = assistantDiv.querySelector(".chirp-msg-content");

  port.onMessage.addListener((msg) => {
    if (msg.type === "delta") {
      assistantDiv.classList.remove("chirp-msg-loading");
      assistantText += msg.text;
      assistantContent.innerHTML = renderMarkdown(assistantText);
      if (userAtBottom) messagesArea.scrollTop = messagesArea.scrollHeight;
    } else if (msg.type === "done") {
      assistantContent.innerHTML = assistantText ? renderMarkdown(assistantText) : "";
      persistOnDone();
      finish();
    } else if (msg.type === "error") {
      assistantDiv.classList.remove("chirp-msg-loading");
      if (msg.code === "NO_API_KEY" || msg.code === "INVALID_API_KEY") {
        renderSetupForm(assistantDiv, highlightId, selText, messagesArea, msg.code);
      } else {
        assistantContent.textContent = "Error: " + msg.error;
      }
      assistantDiv.classList.add("chirp-msg-error");
      finish();
    }
  });
}

function sendMessage(highlightId, selText, userText, messagesArea, { hidden = false, sendBtn } = {}) {
  if (!contextValid()) return;
  if (!sendBtn && bubbleShadow) sendBtn = bubbleShadow.querySelector(".chirp-send");
  const isPageChat = highlightId === PAGE_CHAT_ID;

  function doSend(chatMessages, hl) {
    const userMsg = { role: "user", content: userText };
    if (hidden) userMsg.hidden = true;
    chatMessages.push(userMsg);
    userAtBottom = true;
    if (!hidden) appendMessage(messagesArea, "user", userText, userMsg);

    const assistantMsg = { role: "assistant", content: "" };
    const assistantDiv = appendMessage(messagesArea, "assistant", "", assistantMsg);
    assistantDiv.classList.add("chirp-msg-loading");

    messagesArea._chirpMessages = chatMessages;
    messagesArea._chirpReplyCtx = { isPageChat, hl, highlightId, selText, sendBtn };

    refreshMessageStates(messagesArea);

    let pushed = false;
    function ensurePushed() {
      if (!pushed) {
        chatMessages.push(assistantMsg);
        pushed = true;
      }
    }

    streamInto({
      chatMessages,
      isPageChat,
      hl,
      highlightId,
      selText,
      messagesArea,
      sendBtn,
      assistantDiv,
      onDone: (text) => {
        assistantMsg.content = text;
        ensurePushed();
      },
      onAbort: (partial) => {
        if (partial) {
          assistantMsg.content = partial;
          ensurePushed();
        } else {
          assistantDiv.remove();
        }
      },
      onSettle: () => refreshMessageStates(messagesArea),
    });
  }

  if (isPageChat) {
    doSend(pageChatMessages, null);
  } else {
    const stored = messagesArea?._chirpReplyCtx?.hl;
    if (stored) {
      doSend(stored.messages, stored);
    } else {
      chrome.runtime.sendMessage({ type: "getHighlights", url: location.href }, (highlights) => {
        const hl = highlights?.find((h) => h.id === highlightId);
        doSend(hl?.messages || [], hl);
      });
    }
  }
}
