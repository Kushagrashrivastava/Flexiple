import { parseFault } from "@/lib/llm/client";
import { LlmError } from "@/lib/llm/errors";
import {
  generatePlan,
  repairWarning,
  runSearch,
  type Warning,
} from "@/lib/pipeline";
import { searchRequestSchema } from "@/lib/schemas";
import { ndjsonStream } from "@/lib/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Free text in, a scored shortlist out.
 * Streams progress as NDJSON — see src/lib/stream.ts for why.
 */
export async function POST(request: Request) {
  const fault = parseFault(request.headers.get("x-demo-fault"));

  let query: string;
  try {
    query = searchRequestSchema.parse(await request.json()).query;
  } catch {
    return Response.json(
      { error: { code: "bad_request", title: "That search could not be read", hint: "Enter a few words describing who you are looking for." } },
      { status: 400 },
    );
  }

  return ndjsonStream(async (emit) => {
    try {
      emit({ stage: "planning", detail: "Reading the brief", type: "stage" });

      const carriedWarnings: Warning[] = [];
      const plan = await generatePlan(query, fault, (reason) =>
        carriedWarnings.push(repairWarning(reason)),
      );

      emit({
        type: "stage",
        stage: "planned",
        detail: "Filters and rubric drafted",
      });

      const result = await runSearch({
        query,
        plan,
        fault,
        carriedWarnings,
        onStage: (event) => emit({ type: "stage", ...event }),
      });

      emit({ type: "result", result });
    } catch (error) {
      const llmError =
        error instanceof LlmError
          ? error
          : new LlmError("upstream_error", (error as Error).message);
      console.error("[api/search]", llmError.code, llmError.detail);
      emit({ type: "error", error: llmError.toPayload().error });
    }
  });
}
