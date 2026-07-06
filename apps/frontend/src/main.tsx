import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="shell">
      <section className="intro">
        <p className="eyebrow">Local-first newsletter reader</p>
        <h1>Read Local</h1>
        <p>
          Phase 0 is alive: frontend, backend, worker, SQLite/Prisma scaffolding,
          and nginx are ready for the next phase.
        </p>
        <div className="checks" aria-label="Service endpoints">
          <a href="/api/health">Backend health</a>
          <a href="/worker/health">Worker health</a>
        </div>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
