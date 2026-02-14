document.getElementById("b").addEventListener("click", () => {
  window.parent.postMessage({ type: "chirpy-tooltip-click" }, "*");
});
