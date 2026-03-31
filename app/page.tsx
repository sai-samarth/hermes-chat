const currentScope = [
  "Next.js App Router foundation",
  "TypeScript and ESLint configuration",
  "Single landing page for project framing"
];

const deferredScope = [
  "Authentication",
  "Database and persistence",
  "Hermes gateway integration"
];

export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">Hermes Chat</p>
        <h1>Phase 1 foundation for Hermes Chat.</h1>
        <p className="lead">
          This repo now has a very small Next.js + TypeScript baseline so future
          product work can start from a clean, verified app shell instead of
          broad scaffolding.
        </p>

        <div className="status-strip">
          <span>Step 2 complete</span>
          <span>No auth</span>
          <span>No database</span>
          <span>No Hermes integration yet</span>
        </div>

        <div className="panel-grid">
          <section className="panel">
            <p className="panel-label">Included now</p>
            <ul>
              {currentScope.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="panel panel-muted">
            <p className="panel-label">Deferred on purpose</p>
            <ul>
              {deferredScope.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
