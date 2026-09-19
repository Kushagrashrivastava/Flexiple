import { diffFilters, diffRubric } from "@/lib/diff";
import { parseFault } from "@/lib/llm/client";
import { LlmError } from "@/lib/llm/errors";
import {
  refinePlan,
  repairWarning,
  runSearch,
  type Warning,
} from "@/lib/pipeline";
import { refineRequestSchema } from "@/lib/schemas";
import { ndjsonStream } from "@/lib/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One turn of the refinement loop: recruiter feedback in, an adjusted plan and
 * a re-run shortlist out. The *reason* for each change comes from the model;
 * the list of changes itself is diffed locally so it is always accurate.
 */
export async function POST(request: Request) {
  const fault = parseFault(request.headers.get("x-demo-fault"));

  let body;
  try {
    body = refineRequestSchema.parse(await request.json());
  } catch {
    return Response.json(
      {
        error: {
          code: "bad_request",
          title: "That feedback could not be read",
          hint: "Reload the page and start a new search.",
        },
      },
      { status: 400 },
    );
  }

  return ndjsonStream(async (emit) => {
    try {
      emit({ type: "stage", stage: "refining", detail: "Re-reading the brief with your feedback" });

      const carriedWarnings: Warning[] = [];
      const refinement = await refinePlan({
        ...body,
        fault,
        onRepair: (reason) => carriedWarnings.push(repairWarning(reason)),
      });

      const changes = [
        ...diffFilters(body.filters, refinement.filters),
        ...diffRubric(body.rubric, refinement.rubric),
      ];

      emit({
        type: "stage",
        stage: "planned",
        detail: changes.length
          ? `${changes.length} change${changes.length === 1 ? "" : "s"} to the plan`
          : "No changes needed to the plan",
      });

      const result = await runSearch({
        query: body.query,
        plan: {
          filters: refinement.filters,
          rubric: refinement.rubric,
          interpretation: refinement.reply,
        },
        fault: null, // the fault has already been demonstrated on the plan call
        carriedWarnings,
        onStage: (event) => emit({ type: "stage", ...event }),
      });

      emit({
        type: "result",
        result: {
          ...result,
          reply: refinement.reply,
          rationale: refinement.rationale,
          changes,
        },
      });
    } catch (error) {
      const llmError =
        error instanceof LlmError
          ? error
          : new LlmError("upstream_error", (error as Error).message);
      console.error("[api/refine]", llmError.code, llmError.detail);
      emit({ type: "error", error: llmError.toPayload().error });
    }
  });
}
