import { activeModel, faultsEnabled } from "@/lib/llm/client";
import { loadProfiles } from "@/lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lets the UI tell "no API key configured" apart from "the model failed",
 * so a first-run setup mistake gets a setup message instead of an error card.
 */
export async function GET() {
  return Response.json({
    hasApiKey: Boolean(process.env.GROQ_API_KEY),
    model: activeModel(),
    poolSize: loadProfiles().length,
    faults: faultsEnabled(),
  });
}
