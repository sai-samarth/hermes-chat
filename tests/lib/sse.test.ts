import { describe, expect, it } from "vitest";

import { createSseParser, encodeSseEvent } from "../../lib/sse";

describe("encodeSseEvent", () => {
  it("serializes named events with JSON payloads", () => {
    expect(encodeSseEvent("delta", { text: "hi" })).toBe(
      'event: delta\ndata: {"text":"hi"}\n\n'
    );
  });
});

describe("createSseParser", () => {
  it("reassembles split SSE chunks into typed events", () => {
    const parser = createSseParser();

    expect(parser.push("event: delta\nda")).toEqual([]);
    expect(parser.push('ta: {"text":"he"}\n\n')).toEqual([
      {
        event: "delta",
        data: { text: "he" }
      }
    ]);
  });

  it("supports default message events", () => {
    const parser = createSseParser();

    expect(parser.push('data: {"ok":true}\n\n')).toEqual([
      {
        event: "message",
        data: { ok: true }
      }
    ]);
  });
});
