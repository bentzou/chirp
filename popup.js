const DEFAULTS = {
  openai: "gpt-4.1",
  anthropic: "claude-sonnet-4-5-20250929",
  google: "gemini-2.5-flash",
  openrouter: "anthropic/claude-sonnet-4.5",
};

const MODELS = {
  anthropic: [
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  ],
  google: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  openai: [
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "o4-mini", label: "o4-mini" },
    { value: "o3", label: "o3" },
  ],
  openrouter: [
    { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
    { value: "openai/gpt-4.1", label: "GPT-4.1" },
    { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    { value: "deepseek/deepseek-r1", label: "DeepSeek R1" },
  ],
};

const COLOR_SOLIDS = {
  amber: "#f59e0b",
  blue: "#3b82f6",
  green: "#22c55e",
  pink: "#ec4899",
  purple: "#a855f7",
  red: "#ef4444",
};

// ── Enabled toggle ────────────────────────────────────────────────

const enabledToggle = document.getElementById("enabled-toggle");

chrome.storage.sync.get({ enabled: true }, (data) => {
  enabledToggle.checked = data.enabled;
});

enabledToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked });
});

// ── Tab switching ─────────────────────────────────────────────────

const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
    tabPanels.forEach((p) => p.classList.toggle("active", p.id === "panel-" + tab));
    if (tab === "annotations") loadAnnotations();
    if (tab === "settings") apiKeyEl.focus();
  });
});

// ── Settings ──────────────────────────────────────────────────────

const providerEl = document.getElementById("provider");
const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const customInstructionsEl = document.getElementById("customInstructions");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function updateModelOptions(selectedModel) {
  const models = MODELS[providerEl.value] || [];
  modelEl.innerHTML = "";
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m.value;
    opt.textContent = m.label;
    modelEl.appendChild(opt);
  }
  if (selectedModel && models.some((m) => m.value === selectedModel)) {
    modelEl.value = selectedModel;
  }
}

providerEl.addEventListener("change", () => updateModelOptions());

// Load saved settings
chrome.storage.sync.get(["provider", "apiKey", "model", "customInstructions"], (data) => {
  if (data.provider) providerEl.value = data.provider;
  if (data.apiKey) apiKeyEl.value = data.apiKey;
  if (data.customInstructions) customInstructionsEl.value = data.customInstructions;
  updateModelOptions(data.model);
});

apiKeyEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});

saveBtn.addEventListener("click", () => {
  const settings = {
    provider: providerEl.value,
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value,
    customInstructions: customInstructionsEl.value.trim(),
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

// ── About panel ──────────────────────────────────────────────────

document.getElementById("about-version").textContent =
  "v" + chrome.runtime.getManifest().version;

document.getElementById("open-welcome").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "welcome.html" });
});

// Load annotations on popup open
loadAnnotations();
