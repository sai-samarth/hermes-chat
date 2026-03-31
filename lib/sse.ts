export type ParsedSseEvent<T = unknown> = {
  event: string;
  data: T;
};

function normalizeChunk(chunk: string) {
  return chunk.replace(/\r\n/g, "\n");
}

function parseEventBlock(block: string): ParsedSseEvent {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || "message";
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  const payload = dataLines.join("\n");

  return {
    event,
    data: payload ? (JSON.parse(payload) as unknown) : null
  };
}

export function encodeSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createSseParser() {
  let buffer = "";

  return {
    push(chunk: string) {
      buffer += normalizeChunk(chunk);
      const events: ParsedSseEvent[] = [];

      while (true) {
        const boundaryIndex = buffer.indexOf("\n\n");

        if (boundaryIndex === -1) {
          break;
        }

        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        if (!block.trim()) {
          continue;
        }

        events.push(parseEventBlock(block));
      }

      return events;
    }
  };
}
