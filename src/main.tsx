import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./standalone.css";
import App from "./App";
import { markSafariBrowser } from "./standaloneBrowser";

markSafariBrowser(document, navigator);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
