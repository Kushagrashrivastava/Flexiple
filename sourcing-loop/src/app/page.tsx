import { SourcingApp } from "@/components/SourcingApp";
import { activeModel, faultsEnabled } from "@/lib/llm/client";
import { loadProfiles } from "@/lib/profiles";

export const dynamic = "force-dynamic";

/**
 * Server component: reads the environment once so the client never has to guess
 * whether the app is configured. A missing key gets a setup screen, not an error.
 */
export default function Page() {
  return (
    <SourcingApp
      hasApiKey={Boolean(process.env.GROQ_API_KEY)}
      model={activeModel()}
      poolSize={loadProfiles().length}
      faultsEnabled={faultsEnabled()}
    />
  );
}
