// ── Scroll entrance animations ────────────────────────────────────
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.15 }
);

document.querySelectorAll(".fade-in").forEach((el) => observer.observe(el));

// ── Inline API key form ───────────────────────────────────────────
const providerEl = document.getElementById("welcome-provider");
const apiKeyEl = document.getElementById("welcome-apiKey");
const saveBtn = document.getElementById("welcome-save");
const statusEl = document.getElementById("welcome-status");

// Pre-fill if already configured
chrome.storage.sync.get(["provider", "apiKey"], (data) => {
  if (data.provider) providerEl.value = data.provider;
  if (data.apiKey) apiKeyEl.value = data.apiKey;
});

saveBtn.addEventListener("click", () => {
  const key = apiKeyEl.value.trim();
  if (!key) {
    statusEl.textContent = "Please enter an API key.";
    statusEl.style.color = "#dc2626";
    return;
  }

  chrome.storage.sync.set({ provider: providerEl.value, apiKey: key }, () => {
    statusEl.style.color = "#16a34a";
    statusEl.textContent = "Saved!";
    setTimeout(() => (statusEl.textContent = ""), 2000);
  });
});

apiKeyEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});

// ── Version ──────────────────────────────────────────────────────
const version = "v" + chrome.runtime.getManifest().version;
document.getElementById("hero-version").textContent = version;
document.getElementById("welcome-version").textContent = version;

// ── "Start using Chirp" button ───────────────────────────────────
document.getElementById("start-btn").addEventListener("click", () => {
  window.close();
});
