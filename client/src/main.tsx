import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Önizleme sorunları için dayanıklılık artırımı
const renderApp = () => {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    createRoot(rootElement).render(<App />);
  } else {
    console.error("Root element bulunamadı!");
    // 100ms sonra tekrar dene
    setTimeout(renderApp, 100);
  }
};

// Uygulama başlatma
renderApp();
