import { mount } from "svelte";
import { setupI18n } from "@asteria/ui";
import "@asteria/ui/tokens.css";
import "./app.css";
import App from "./App.svelte";

setupI18n("fr");

export default mount(App, { target: document.getElementById("app")! });
