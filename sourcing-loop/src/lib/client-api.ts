import type { PlanChange } from "./diff";
import type { LlmErrorPayload } from "./llm/errors";
import type { SearchOutcome } from "./pipeline";
import type { Refinement } from "./schemas";

export type RefineOutcome = SearchOutcome & {
  reply: string;
  rationale: Refinement["rationale"];
  changes: PlanChange[];
};

type Handlers<T> = {
  onStage: (stage: string, detail?: string) => void;
  onResult: (result: T) => void;
  onError: (error: LlmErrorPayload) => void;
};

/**
 * Reads the NDJSON progress stream from a route, dispatching each line as it
 * lands so the thinking state reflects real server progress.
 */
export async function streamPost<T>(
  url: string,
  body: unknown,
  handlers: Handlers<T>,
  options: { fault?: string | null; signal?: AbortSignal } = {},
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.fault ? { "x-demo-fault": options.fault } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    handlers.onError({
      code: "upstream_error",
      title: "Could not reach the server",
      hint: "Check that the dev server is still running, then retry.",
    });
    return;
  }

  if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
    const payload = (await response.json()) as { error: LlmErrorPayload };
    handlers.onError(payload.error);
    return;
  }

  if (!response.body) {
    handlers.onError({
      code: "no_response",
      title: "The server returned an empty response",
      hint: "Retry in a moment.",
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue; // a partial line; the next chunk completes it
      }
      if (event.type === "stage") handlers.onStage(event.stage, event.detail);
      else if (event.type === "result") handlers.onResult(event.result as T);
      else if (event.type === "error") handlers.onError(event.error);
    }
  }
}
