import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import "./index.css";

let appRoot: Root | null = null;

function renderApp() {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    console.error("Root element bulunamadı!");
    setTimeout(renderApp, 100);
    return;
  }

  if (!appRoot) {
    appRoot = createRoot(rootElement);
  }

  appRoot.render(<App />);
}

renderApp();

// React Fast Refresh @vitejs/plugin-react tarafından yönetilir;
// manuel hot.accept tüm uygulamayı yeniden mount edip reset hissi veriyordu.
