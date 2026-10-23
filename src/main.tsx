import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./standalone.css";
import App from "./App";
import { markSafariBrowser } from "./standaloneBrowser";

markSafariBrowser(document, navigator);


import "./standalone/shell.css";
import "./standalone/layout.css";
document.body.classList.add("dataspace-standalone");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
