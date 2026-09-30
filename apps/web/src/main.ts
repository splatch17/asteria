import { mount } from "svelte";
import { setupI18n } from "@asteria/ui";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/big-shoulders-display/700";
import "@fontsource/cormorant/500-italic";
import "@asteria/ui/tokens.css";
import "./app.css";
import App from "./App.svelte";

setupI18n("fr");

export default mount(App, { target: document.getElementById("app")! });
