import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { IslandWindow } from "./IslandWindow";
import "./index.css";

// the island is a window of its own, over the menu bar, drawn from the same bundle
const island = location.hash === "#island";
if (island) document.documentElement.style.background = document.body.style.background = "transparent";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{island ? <IslandWindow /> : <App />}</React.StrictMode>,
);
