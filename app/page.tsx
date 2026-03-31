const threads = [
  {
    title: "Apex Labs renewal escalation",
    updated: "2m ago",
    blurb: "Legal review requested before the executive reply goes out.",
    meta: "Priority thread",
    active: true
  },
  {
    title: "Northwind migration handoff",
    updated: "48m ago",
    blurb: "Entitlements summary and rollout timing are ready for review.",
    meta: "Operations",
    active: false
  },
  {
    title: "Brightline onboarding draft",
    updated: "Mar 29",
    blurb: "Welcome sequence copy needs a final tone pass.",
    meta: "Lifecycle",
    active: false
  },
  {
    title: "Kite billing exception",
    updated: "Mar 27",
    blurb: "Finance wants the customer-facing explanation simplified.",
    meta: "Billing",
    active: false
  }
];

const facts = [
  {
    label: "Queue",
    value: "Enterprise renewals"
  },
  {
    label: "Owner",
    value: "CS operations"
  },
  {
    label: "Next review",
    value: "14:00 UTC"
  }
];

const messages = [
  {
    role: "assistant",
    author: "Hermes Draft",
    time: "09:14",
    lines: [
      "Proposed reply: confirm procurement coverage, acknowledge that amended language is under review, and offer leadership a revision window before the day closes.",
      "The tone stays direct and executive. It removes soft qualifiers and avoids promising approval before legal signs off."
    ]
  },
  {
    role: "user",
    author: "Maya Chen",
    time: "09:16",
    lines: [
      "Tighten the first paragraph. The customer only needs confirmation that procurement is covered and that the revised language will be back in front of leadership today."
    ]
  },
  {
    role: "assistant",
    author: "Hermes Draft",
    time: "09:18",
    lines: [
      "Revision applied: procurement coverage now leads, the scheduling note moves to the second paragraph, and the approval language stays explicitly provisional."
    ]
  },
  {
    role: "user",
    author: "Account Team",
    time: "09:21",
    lines: [
      "This is close. Keep the tone measured, make ownership explicit, and leave the thread with one clean next step for the customer."
    ]
  }
];

export default function Home() {
  return (
    <main className="preview-shell">
      <div className="workspace-shell">
        <aside className="sidebar" aria-label="Workspace navigation">
          <div className="sidebar-top">
            <div className="brand-mark">H</div>

            <div>
              <p className="eyebrow">Hermes Chat</p>
              <p className="sidebar-title">Support workspace</p>
              <p className="sidebar-intro">
                Enterprise conversations, escalations, and response drafting in
                one restrained workspace.
              </p>
            </div>
          </div>

          <section aria-labelledby="threads-heading" className="sidebar-section">
            <div className="section-head">
              <p id="threads-heading" className="section-label">
                Open threads
              </p>
              <p className="section-count">12 active</p>
            </div>

            <ul className="thread-list">
              {threads.map((thread) => (
                <li
                  key={thread.title}
                  className={`thread-item${thread.active ? " thread-item-active" : ""}`}
                >
                  <div className="thread-row">
                    <p className="thread-title">{thread.title}</p>
                    <p className="thread-updated">{thread.updated}</p>
                  </div>

                  <p className="thread-blurb">{thread.blurb}</p>
                  <p className="thread-meta">{thread.meta}</p>
                </li>
              ))}
            </ul>
          </section>

          <div className="sidebar-foot">
            <p className="sidebar-note-title">Review shell</p>
            <p className="sidebar-note">
              Single route, no live systems attached.
            </p>
          </div>
        </aside>

        <section className="chat-panel" aria-label="Support workspace">
          <header className="chat-topbar">
            <div className="chat-title-block">
              <p className="eyebrow">Enterprise renewals</p>

              <div className="chat-heading-row">
                <h1>Apex Labs renewal escalation</h1>
                <span className="review-pill">Static review</span>
              </div>

              <p className="chat-summary">
                Customer success requested a tighter executive response before
                legal follow-up. The conversation stays visually primary while
                the surrounding workspace remains quiet.
              </p>
            </div>

            <div className="chat-context">
              <dl className="chat-facts" aria-label="Thread details">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </header>

          <div className="message-list" aria-label="Conversation transcript">
            <p className="timeline-mark">Tuesday, March 31</p>

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

          <footer className="composer-shell" aria-label="Response draft">
            <div className="composer-field">
              <p className="composer-label">Response draft</p>
              <p className="composer-placeholder">
                Confirm procurement coverage, keep approval language precise,
                and offer leadership a revision window before 14:00 UTC.
              </p>
              <p className="composer-copy">
                Executive tone, concise confirmation, clear ownership.
              </p>
            </div>

            <button className="composer-button" type="button" disabled>
              Send
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
