import { mount } from "svelte";
import { setupI18n } from "@asteria/ui";
import "@asteria/ui/tokens.css";
import "./app.css";
import App from "./App.svelte";
import { startOffline, watchNetwork } from "./lib/offline-client.svelte";

setupI18n("fr");
watchNetwork();
startOffline();

export default mount(App, { target: document.getElementById("app")! });
