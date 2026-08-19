import { useState, useEffect } from "react";
import { initTauri } from "./tauri";
import DesktopApp from "./DesktopApp";
import "./App.css";

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
      const ok = await initTauri();
      setIsTauriMode(ok);
      setInitDone(true);
    })();
  }, []);

  if (!initDone) return <LoadingScreen />;
  if (!isTauriMode) {
    return (
      <div className="app-layout">
        <main className="main-area">
          <div className="empty-state">
            Esta app solo funciona dentro de la aplicacion de escritorio / movil.
          </div>
        </main>
      </div>
    );
  }
  return <DesktopApp />;
}

export default App;