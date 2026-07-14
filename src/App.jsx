import { useState, useEffect, lazy, Suspense } from "react";
import { initTauri, isTauri } from "./tauri";
import * as api from "./api";
import DesktopApp from "./DesktopApp";
import "./App.css";

const WebApp = lazy(() => import("./WebApp"));

function LoadingScreen() {
  return (
    <div className="app-layout">
      <main className="main-area">
        <div className="loading"><div className="spinner" /></div>
      </main>
    </div>
  );
}

function App() {
  const [initDone, setInitDone] = useState(false);
  const [isTauriMode, setIsTauriMode] = useState(false);

  useEffect(() => {
    (async () => {
      await initTauri();
      await api.initApi();
      const hasRealInvoke =
        typeof window !== "undefined" &&
        window.__TAURI_INTERNALS__ !== undefined &&
        typeof window.__TAURI_INTERNALS__.invoke === "function";
      setIsTauriMode(isTauri() && hasRealInvoke);
      setInitDone(true);
    })();
  }, []);

  if (!initDone) return <LoadingScreen />;
  if (!isTauriMode) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <WebApp />
      </Suspense>
    );
  }
  return <DesktopApp />;
}

export default App;
