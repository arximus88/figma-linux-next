import "../theme.css";
import "./settings.css";
import { mount } from "svelte";
import App from "./App.svelte";

mount(App, {
  target: document.body,
});
