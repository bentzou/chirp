const DEFAULTS = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-5-20250929",
  google: "gemini-2.0-flash",
};

const COLOR_SOLIDS = {
  amber: "#f59e0b",
  blue: "#3b82f6",
  green: "#22c55e",
  pink: "#ec4899",
  purple: "#a855f7",
  red: "#ef4444",
};

// ── Tab switching ─────────────────────────────────────────────────

const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
    tabPanels.forEach((p) => p.classList.toggle("active", p.id === "panel-" + tab));
    if (tab === "annotations") loadAnnotations();
  });
});

// ── Settings ──────────────────────────────────────────────────────

const providerEl = document.getElementById("provider");
const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function updatePlaceholder() {
  modelEl.placeholder = DEFAULTS[providerEl.value] + " (default)";
}

providerEl.addEventListener("change", updatePlaceholder);

// Load saved settings
chrome.storage.sync.get(["provider", "apiKey", "model"], (data) => {
  if (data.provider) providerEl.value = data.provider;
  if (data.apiKey) apiKeyEl.value = data.apiKey;
  if (data.model) modelEl.value = data.model;
  updatePlaceholder();
});

saveBtn.addEventListener("click", () => {
  const settings = {
    provider: providerEl.value,
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value.trim() || "",
  };

  if (!settings.apiKey) {
    statusEl.textContent = "Please enter an API key.";
    statusEl.style.color = "#dc2626";
    return;
  }

  chrome.storage.sync.set(settings, () => {
    statusEl.style.color = "#16a34a";
    statusEl.textContent = "Settings saved!";
    setTimeout(() => (statusEl.textContent = ""), 2000);
  });
});

// ── Annotations ───────────────────────────────────────────────────

const annotationsList = document.getElementById("annotations-list");

function loadAnnotations() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const url = tabs[0].url;
    const tabId = tabs[0].id;

    chrome.runtime.sendMessage({ type: "getHighlights", url }, (highlights) => {
      annotationsList.innerHTML = "";

      if (!highlights || highlights.length === 0) {
        const empty = document.createElement("div");
        empty.className = "annotations-empty";
        empty.textContent = "No highlights on this page";
        annotationsList.appendChild(empty);
        return;
      }

      for (const hl of highlights) {
        const item = document.createElement("div");
        item.className = "annotation-item";

        const colorDot = document.createElement("span");
        colorDot.className = "annotation-color";
        colorDot.style.background = COLOR_SOLIDS[hl.color || "amber"] || COLOR_SOLIDS.amber;

        const text = document.createElement("span");
        text.className = "annotation-text";
        text.textContent = hl.text.length > 60 ? hl.text.slice(0, 57) + "..." : hl.text;
        text.title = hl.text;

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "annotation-delete";
        deleteBtn.textContent = "\u00d7";
        deleteBtn.title = "Delete highlight";

        // Click annotation to scroll to it
        item.addEventListener("click", (e) => {
          if (e.target === deleteBtn) return;
          chrome.tabs.sendMessage(tabId, { type: "scrollToHighlight", id: hl.id });
        });

        // Delete annotation
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ type: "deleteHighlight", url, id: hl.id }, () => {
            chrome.tabs.sendMessage(tabId, { type: "removeHighlightFromPage", id: hl.id });
            loadAnnotations();
          });
        });

        item.appendChild(colorDot);
        item.appendChild(text);
        item.appendChild(deleteBtn);
        annotationsList.appendChild(item);
      }
    });
  });
}

// Load annotations on popup open
loadAnnotations();
