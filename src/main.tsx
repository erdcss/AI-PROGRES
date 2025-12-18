import { createRoot } from "react-dom/client";
import App from "../client/src/App";
import "../client/src/index.css";

const renderApp = () => {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    createRoot(rootElement).render(<App />);
  } else {
    console.error("Root element bulunamadı!");
    setTimeout(renderApp, 100);
  }
};

renderApp();
