function renderApp() {
  const root = createRoot(document.getElementById("root")!);
  root.render(<StrictMode><App /></StrictMode>);
}

queueMicrotask(renderApp);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
