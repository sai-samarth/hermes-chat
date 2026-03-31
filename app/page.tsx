"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { ChatMessage } from "@/lib/chat-types";

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
    label: "Boundary",
    value: "Hermes API server"
  },
  {
    label: "State",
    value: "Browser memory"
  },
  {
    label: "Next step",
    value: "Gateway-native adapter"
  }
];

type TranscriptMessage = {
  author: string;
  content: string;
  id: string;
  role: "assistant" | "user";
  time: string;
};

const initialMessages: TranscriptMessage[] = [
  {
    id: "assistant-0914",
    role: "assistant",
    author: "Hermes",
    time: "09:14",
    content:
      "Proposed reply: confirm procurement coverage, acknowledge that amended language is under review, and offer leadership a revision window before the day closes.\n\nThe tone stays direct and executive. It removes soft qualifiers and avoids promising approval before legal signs off."
  },
  {
    id: "user-0916",
    role: "user",
    author: "Maya Chen",
    time: "09:16",
    content:
      "Tighten the first paragraph. The customer only needs confirmation that procurement is covered and that the revised language will be back in front of leadership today."
  },
  {
    id: "assistant-0918",
    role: "assistant",
    author: "Hermes",
    time: "09:18",
    content:
      "Revision applied: procurement coverage now leads, the scheduling note moves to the second paragraph, and the approval language stays explicitly provisional."
  },
  {
    id: "user-0921",
    role: "user",
    author: "Account Team",
    time: "09:21",
    content:
      "This is close. Keep the tone measured, make ownership explicit, and leave the thread with one clean next step for the customer."
  }
];

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit"
});

function formatMessageTime(date: Date) {
  return timeFormatter.format(date);
}

function toApiMessages(messages: TranscriptMessage[]): ChatMessage[] {
  return messages.map(({ content, role }) => ({
    role,
    content
  }));
}

export default function Home() {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const transcriptNode = transcriptRef.current;

    if (!transcriptNode) {
      return;
    }

    transcriptNode.scrollTo({
      top: transcriptNode.scrollHeight,
      behavior: "smooth"
    });
  }, [isLoading, messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = draft.trim();

    if (!content || isLoading) {
      return;
    }

    const submittedAt = new Date();
    const nextUserMessage: TranscriptMessage = {
      id: crypto.randomUUID(),
      role: "user",
      author: "You",
      time: formatMessageTime(submittedAt),
      content
    };
    const nextMessages = [...messages, nextUserMessage];

    setMessages(nextMessages);
    setDraft("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: toApiMessages(nextMessages)
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: ChatMessage }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "The Hermes request failed.");
      }

      if (payload?.message?.role !== "assistant") {
        throw new Error("Hermes returned an unexpected response shape.");
      }

      const assistantMessage = payload.message;

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          author: "Hermes",
          time: formatMessageTime(new Date()),
          content: assistantMessage.content
        }
      ]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The Hermes request failed."
      );
    } finally {
      setIsLoading(false);
    }
  }

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
            <p className="sidebar-note-title">Backend slice</p>
            <p className="sidebar-note">
              Single route with local state and a temporary Hermes API server
              boundary.
            </p>
          </div>
        </aside>

        <section className="chat-panel" aria-label="Support workspace">
          <header className="chat-topbar">
            <div className="chat-title-block">
              <p className="eyebrow">Enterprise renewals</p>

              <div className="chat-heading-row">
                <h1>Apex Labs renewal escalation</h1>
                <span className="review-pill">Hermes API slice</span>
              </div>

              <p className="chat-summary">
                This first backend slice keeps the existing workspace shell
                intact while routing message requests through the Hermes API
                server. Session state stays local until the gateway-native
                model lands.
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

          <div
            ref={transcriptRef}
            className="message-list"
            aria-label="Conversation transcript"
          >
            <p className="timeline-mark">Live session</p>

            {messages.map((message) => (
              <article
                key={message.id}
                className={`message message-${message.role}`}
              >
                <div className="message-meta">
                  <span>{message.author}</span>
                  <span>{message.time}</span>
                </div>

                <p className="message-copy">{message.content}</p>
              </article>
            ))}

            {isLoading ? (
              <article
                className="message message-assistant message-pending"
                aria-live="polite"
              >
                <div className="message-meta">
                  <span>Hermes</span>
                  <span>Drafting</span>
                </div>
                <p className="message-copy">
                  Request in flight through the Hermes API server.
                </p>
              </article>
            ) : null}
          </div>

          <footer className="composer-shell" aria-label="Chat composer">
            <form className="composer-form" onSubmit={handleSubmit}>
              <div className="composer-field">
                <label className="composer-label" htmlFor="chat-draft">
                  Message Hermes
                </label>
                <textarea
                  id="chat-draft"
                  className="composer-input"
                  name="chat-draft"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Confirm procurement coverage, keep approval language precise, and leave the customer with one clear next step."
                  rows={4}
                  disabled={isLoading}
                />
                <p className="composer-copy">
                  No auth, no persistence, and no streaming in this first
                  backend slice.
                </p>
              </div>

              <div className="composer-actions">
                {error ? (
                  <p className="composer-status composer-status-error" role="alert">
                    {error}
                  </p>
                ) : (
                  <p className="composer-status" aria-live="polite">
                    {isLoading
                      ? "Hermes is drafting a reply..."
                      : "Messages stay in browser memory for this session."}
                  </p>
                )}

                <button
                  className="composer-button"
                  type="submit"
                  disabled={isLoading || draft.trim().length === 0}
                >
                  {isLoading ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </footer>
        </section>
      </div>
    </main>
  );
}
