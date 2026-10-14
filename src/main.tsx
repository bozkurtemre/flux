import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import { ForceUpdate } from "./components/ForceUpdate";
import { IslandWindow } from "./IslandWindow";
import { SplashWindow } from "./components/SplashWindow";
import "./index.css";

// the island and the splash are windows of their own, drawn from the same bundle
const island = location.hash === "#island";
const splash = location.hash === "#splash";
if (island || splash) document.documentElement.style.background = document.body.style.background = "transparent";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {island ? (
      <IslandWindow />
    ) : splash ? (
      <SplashWindow />
    ) : (
      // a version that may no longer run is told so before anything else; past that, the
      // window opens for someone signed in, and only then
      <ForceUpdate>
        <AuthGate>
          <App />
        </AuthGate>
      </ForceUpdate>
    )}
  </React.StrictMode>,
);
