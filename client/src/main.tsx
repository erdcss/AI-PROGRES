import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { initDevStability } from "./lib/dev-stability";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import "./index.css";

initDevStability();

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

  appRoot.render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

renderApp();

// React Fast Refresh @vitejs/plugin-react tarafından yönetilir;
// manuel hot.accept tüm uygulamayı yeniden mount edip reset hissi veriyordu.
