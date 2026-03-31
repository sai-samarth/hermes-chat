import type { ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      parts.push(
        <strong key={`${keyPrefix}-strong-${index}`}>{match[2]}</strong>
      );
    } else if (match[4]) {
      parts.push(
        <code key={`${keyPrefix}-code-${index}`}>{match[4]}</code>
      );
    }

    lastIndex = pattern.lastIndex;
    index += 1;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function isBulleted(line: string) {
  return /^[-*•]\s+/.test(line);
}

function isNumbered(line: string) {
  return /^\d+\.\s+/.test(line);
}

function isShortLabel(line: string) {
  return line.endsWith(":") && line.length <= 72 && !line.includes("  ");
}

export function renderChatMarkdown(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return null;
  }

  const blocks = normalized.split(/\n\n+/);

  return blocks.map((block, blockIndex) => {
    if (block.startsWith("```") && block.endsWith("```")) {
      const code = block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      return (
        <pre key={`code-${blockIndex}`} className="message-code-block">
          <code>{code}</code>
        </pre>
      );
    }

    const lines = block.split("\n").filter(Boolean);

    if (lines.length > 0 && lines.every(isBulleted)) {
      return (
        <ul key={`ul-${blockIndex}`} className="message-list-block">
          {lines.map((line, itemIndex) => (
            <li key={`ul-${blockIndex}-${itemIndex}`}>
              {renderInline(line.replace(/^[-*•]\s+/, ""), `ul-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ul>
      );
    }

    if (lines.length > 0 && lines.every(isNumbered)) {
      return (
        <ol key={`ol-${blockIndex}`} className="message-list-block message-list-numbered">
          {lines.map((line, itemIndex) => (
            <li key={`ol-${blockIndex}-${itemIndex}`}>
              {renderInline(line.replace(/^\d+\.\s+/, ""), `ol-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ol>
      );
    }

    if (lines.length === 1 && isShortLabel(lines[0])) {
      return (
        <p key={`label-${blockIndex}`} className="message-section-label">
          {renderInline(lines[0].slice(0, -1), `label-${blockIndex}`)}
        </p>
      );
    }

    return (
      <p key={`p-${blockIndex}`} className="message-paragraph">
        {lines.map((line, lineIndex) => (
          <span key={`line-${blockIndex}-${lineIndex}`}>
            {lineIndex > 0 ? <br /> : null}
            {renderInline(line, `p-${blockIndex}-${lineIndex}`)}
          </span>
        ))}
      </p>
    );
  });
}
