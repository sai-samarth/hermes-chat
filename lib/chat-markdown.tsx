import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

export function renderChatMarkdown(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return null;
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        h1: ({ children }) => <h1 className="message-heading message-heading-xl">{children}</h1>,
        h2: ({ children }) => <h2 className="message-heading message-heading-lg">{children}</h2>,
        h3: ({ children }) => <h3 className="message-heading message-heading-md">{children}</h3>,
        p: ({ children }) => <p className="message-paragraph">{children}</p>,
        ul: ({ children }) => <ul className="message-list-block message-list-bulleted">{children}</ul>,
        ol: ({ children }) => <ol className="message-list-block message-list-numbered">{children}</ol>,
        li: ({ children }) => <li className="message-list-item">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="message-blockquote">{children}</blockquote>
        ),
        hr: () => <hr className="message-divider" />,
        pre: ({ children }) => <pre className="message-code-block">{children}</pre>,
        code: ({ className, children, ...props }) => {
          const languageClassName = className ?? "";
          const isBlock = languageClassName.includes("language-");

          if (isBlock) {
            return (
              <code className={`message-code ${languageClassName}`.trim()} {...props}>
                {children}
              </code>
            );
          }

          return (
            <code className="message-inline-code" {...props}>
              {children}
            </code>
          );
        },
        a: ({ href, children }) => (
          <a
            className="message-link"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {children}
          </a>
        ),
        table: ({ children }) => <table className="message-table">{children}</table>,
        thead: ({ children }) => <thead className="message-table-head">{children}</thead>,
        tbody: ({ children }) => <tbody className="message-table-body">{children}</tbody>,
        th: ({ children }) => <th className="message-table-cell">{children}</th>,
        td: ({ children }) => <td className="message-table-cell">{children}</td>,
        strong: ({ children }) => <strong className="message-strong">{children}</strong>,
        em: ({ children }) => <em className="message-emphasis">{children}</em>
      }}
    >
      {normalized}
    </ReactMarkdown>
  );
}
