import "../theme.css";
import { mount } from "svelte";
import App from "./App.svelte";

console.log("[Panel] window.figmaApi exists:", !!window.figmaApi);
console.log(
  "[Panel] window.figmaApi keys:",
  window.figmaApi ? Object.keys(window.figmaApi) : "N/A",
);

try {
  mount(App, {
    target: document.body,
  });
  console.log("[Panel] Svelte app mounted successfully");
} catch (e) {
  console.error("[Panel] Svelte mount error:", e);
  document.body.innerHTML = `<pre style="color:red;padding:8px">${e.stack || e}</pre>`;
}
