const threads = [
  {
    title: "Customer escalation draft",
    detail: "Selected review thread",
    active: true
  },
  {
    title: "Bug triage summary",
    detail: "Yesterday",
    active: false
  },
  {
    title: "Onboarding tone pass",
    detail: "Mar 29",
    active: false
  },
  {
    title: "Billing transcript audit",
    detail: "Mar 27",
    active: false
  }
];

const messages = [
  {
    role: "assistant",
    author: "Hermes Shell",
    time: "09:14",
    lines: [
      "This route stays intentionally static so review stays focused on structure, spacing, and product tone.",
      "Navigation, transcript, and composer are placeholders for a phase-1 shell review only."
    ]
  },
  {
    role: "user",
    author: "Product Review",
    time: "09:16",
    lines: [
      "Make the main pane feel primary. Keep the sidebar quieter and stop relying on decorative labels to explain the phase."
    ]
  },
  {
    role: "assistant",
    author: "Hermes Shell",
    time: "09:18",
    lines: [
      "The revised direction uses flatter surfaces, tighter radii, a cleaner sans-first type system, and a calmer neutral palette.",
      "Preview labeling stays present, but only where it helps reviewers understand that nothing is wired yet."
    ]
  },
  {
    role: "user",
    author: "Project Scope",
    time: "09:19",
    lines: [
      "Keep auth, persistence, streaming, and Hermes connectivity out of this step. The route should remain a static shell in app/page.tsx."
    ]
  }
];

const outOfScope = [
  "Interactive chat behavior",
  "Authentication and accounts",
  "Database or persistence",
  "Hermes API integration"
];

export default function Home() {
  return (
    <main className="preview-shell">
      <aside className="sidebar" aria-label="Static navigation shell preview">
        <div className="sidebar-top">
          <div className="brand-mark">H</div>
          <div>
            <p className="eyebrow">Hermes Chat</p>
            <h1>App shell review</h1>
          </div>
        </div>

        <p className="sidebar-intro">
          Static phase-1 workspace preview focused on layout, hierarchy, and
          overall product tone.
        </p>

        <section aria-labelledby="threads-heading" className="sidebar-section">
          <div className="section-head">
            <p id="threads-heading" className="section-label">
              Preview threads
            </p>
            <span className="section-note">Mocked list</span>
          </div>

          <ul className="thread-list">
            {threads.map((thread) => (
              <li
                key={thread.title}
                className={`thread-item${thread.active ? " thread-item-active" : ""}`}
              >
                <p className="thread-title">{thread.title}</p>
                <p className="thread-detail">{thread.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="scope-heading" className="sidebar-section sidebar-foot">
          <p id="scope-heading" className="section-label">
            Deferred in phase 1
          </p>
          <ul className="scope-list">
            {outOfScope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="sidebar-note">
            Single route at <code>app/page.tsx</code>. Static shell only.
          </p>
        </section>
      </aside>

      <section className="chat-panel" aria-label="Static chat application shell">
        <header className="chat-topbar">
          <div className="chat-title-block">
            <p className="eyebrow">Static preview shell</p>
            <h2>Customer support workspace</h2>
            <p className="chat-summary">
              Cleaner app-shell direction for review: quieter navigation,
              stronger conversation focus, and flatter surfaces throughout.
            </p>
          </div>

          <div className="chat-meta" aria-label="Preview context">
            <p className="chat-meta-label">Phase 1 review</p>
            <p className="chat-meta-copy">
              Single route only.
              <br />
              No behavior wired.
            </p>
          </div>
        </header>

        <div className="review-strip">
          <p>
            Static review shell: transcript, sidebar, and composer remain
            non-interactive placeholders for layout feedback only.
          </p>
        </div>

        <div className="message-list" aria-label="Mocked conversation">
          <p className="transcript-label">Mock transcript for shell review</p>

          {messages.map((message) => (
            <article
              key={`${message.role}-${message.time}`}
              className={`message message-${message.role}`}
            >
              <div className="message-meta">
                <span>{message.author}</span>
                <span>{message.time}</span>
              </div>

              {message.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </article>
          ))}
        </div>

        <footer className="composer-shell" aria-label="Static composer preview">
          <div className="composer-field">
            <p className="composer-placeholder">Message Hermes Chat</p>
            <p className="composer-copy">
              Disabled in review. No state, streaming, auth, persistence, or
              backend connectivity is included in this phase.
            </p>
          </div>

          <div className="composer-actions">
            <span className="composer-status">Static composer</span>
            <button className="composer-button" type="button" disabled>
              Send
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
