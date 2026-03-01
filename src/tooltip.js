document.getElementById("b").addEventListener("click", () => {
  window.parent.postMessage({ type: "chirp-tooltip-click" }, "*");
});
