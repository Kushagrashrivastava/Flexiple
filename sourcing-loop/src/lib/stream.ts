import type { SearchOutcome } from "./pipeline";
import type { PlanChange } from "./diff";
import type { LlmErrorPayload } from "./llm/errors";
import type { Refinement } from "./schemas";

/**
 * The search takes several seconds and several model calls. Rather than hold a
 * spinner and hope, the route streams newline-delimited JSON so the UI can show
 * what is actually happening: reading the brief, filtering, scoring batch 2 of 4.
 * The progress is real, not a timed animation.
 */

export type StreamEvent =
  | { type: "stage"; stage: string; detail?: string }
  | { type: "result"; result: SearchOutcome }
  | {
      type: "result";
      result: SearchOutcome & {
        reply: string;
        rationale: Refinement["rationale"];
        changes: PlanChange[];
      };
    }
  | { type: "error"; error: LlmErrorPayload };

export function ndjsonStream(
  produce: (emit: (event: StreamEvent) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await produce(emit);
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
