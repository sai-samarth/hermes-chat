const chatHistory = [
  {
    title: "Ops handoff notes",
    detail: "Pinned mock thread"
  },
  {
    title: "Billing follow-up",
    detail: "Yesterday"
  },
  {
    title: "Voice UX review",
    detail: "Mar 29"
  },
  {
    title: "Launch checklist",
    detail: "Mar 27"
  }
];

const messages = [
  {
    role: "assistant",
    author: "Hermes Preview",
    time: "09:14",
    lines: [
      "This screen is a static Phase 1 app-shell preview for layout review only.",
      "It is intentionally limited to visual structure: sidebar, header, mocked chat history, mocked messages, and a non-interactive composer."
    ]
  },
  {
    role: "user",
    author: "Product Review",
    time: "09:16",
    lines: [
      "Keep the UI modern and familiar, but do not introduce live chat behavior, auth, persistence, or API wiring yet."
    ]
  },
  {
    role: "assistant",
    author: "Hermes Preview",
    time: "09:18",
    lines: [
      "The shell stays on a single route at app/page.tsx and gives reviewers a concrete sense of spacing, hierarchy, and responsive behavior.",
      "Everything here is mocked for Phase 1 feedback."
    ]
  },
  {
    role: "user",
    author: "Project Scope",
    time: "09:19",
    lines: [
      "Next steps can wire the real experience later. For now, the repo should clearly communicate that this is a static preview build."
    ]
  }
];

const outOfScope = [
  "Auth and user accounts",
  "Database and persistence",
  "Hermes API integration"
];

export default function Home() {
  return (
    <main className="preview-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">H</div>
          <div>
            <p className="section-label">Hermes Chat</p>
            <h1>Static app shell preview</h1>
          </div>
        </div>

        <section className="sidebar-card">
          <p className="section-label">Phase 1 preview only</p>
          <p className="sidebar-copy">
            Frontend-only visual shell for review. No interactivity, state
            management, auth, database work, or API calls are included.
          </p>
        </section>

        <div className="ghost-action">New chat disabled in preview</div>

        <section aria-labelledby="history-heading" className="sidebar-section">
          <div className="sidebar-heading">
            <p id="history-heading" className="section-label">
              Mocked chat history
            </p>
            <span className="tag">Visual only</span>
          </div>

          <ul className="history-list">
            {chatHistory.map((item) => (
              <li key={item.title} className="history-item">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sidebar-card">
          <p className="section-label">Deferred on purpose</p>
          <ul className="scope-list">
            {outOfScope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </aside>

      <section className="chat-frame" aria-label="Static chat application shell">
        <header className="chat-header">
          <div>
            <p className="section-label">Current view</p>
            <h2>Customer support workspace</h2>
            <p className="header-copy">
              A polished single-route shell meant for visual feedback before any
              real product wiring begins.
            </p>
          </div>

          <div className="header-tags" aria-label="Preview status">
            <span>Static preview</span>
            <span>Single route</span>
            <span>Phase 1</span>
          </div>
        </header>

        <section className="conversation-card">
          <div className="notice-banner">
            <p className="section-label">Status</p>
            <p>
              This is a non-interactive Hermes Chat preview for structure,
              hierarchy, and styling review only.
            </p>
          </div>

          <div className="message-list" aria-label="Mocked conversation">
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
            <div>
              <p className="composer-placeholder">Message Hermes Chat</p>
              <p className="composer-copy">
                Static Phase 1 preview. Composer actions, persistence, and
                Hermes connectivity are intentionally not wired yet.
              </p>
            </div>

            <div className="composer-tags" aria-hidden="true">
              <span>Attachments later</span>
              <span className="send-pill">Send</span>
            </div>
          </footer>
        </section>
      </section>
    </main>
  );
}
