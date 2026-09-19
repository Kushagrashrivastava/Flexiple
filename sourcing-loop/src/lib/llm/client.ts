import type { ZodType, ZodTypeDef } from "zod";
import { LlmError } from "./errors";

/**
 * A small, honest Groq client.
 *
 * Real server-side calls only — the key never leaves this process. Everything
 * the product renders goes through `completeJson`, which parses, validates
 * against a Zod schema, and gets exactly one repair attempt before failing with
 * a typed error the UI knows how to present.
 */

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
const TIMEOUT_MS = 30_000;
/**
 * gpt-oss models spend part of the completion budget on reasoning tokens
 * before emitting any JSON, and a budget overrun truncates the JSON rather
 * than failing loudly. These calls are extraction and judgement, not puzzles,
 * so low effort is both correct and leaves room for the answer.
 */
const REASONING_EFFORT = process.env.GROQ_REASONING_EFFORT ?? "low";
const MAX_TRANSPORT_RETRIES = 2;

/**
 * Deliberate failure injection, so the failure states can be demonstrated on
 * command instead of hoping the free tier misbehaves on camera.
 * Disabled unless DEMO_FAULTS=1, and never on in production.
 */
export type DemoFault = "rate_limited" | "timeout" | "malformed" | "missing_key";

export const faultsEnabled = () =>
  process.env.DEMO_FAULTS === "1" && process.env.NODE_ENV !== "production";

export function parseFault(header: string | null): DemoFault | null {
  if (!header || !faultsEnabled()) return null;
  return ["rate_limited", "timeout", "malformed", "missing_key"].includes(header)
    ? (header as DemoFault)
    : null;
}

export type Message = { role: "system" | "user" | "assistant"; content: string };

type CompleteOptions = {
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  fault?: DemoFault | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One raw round trip, with a timeout and backoff on retryable statuses. */
async function callGroq({
  messages,
  temperature = 0.2,
  maxTokens = 3000,
  fault = null,
}: CompleteOptions): Promise<string> {
  if (fault === "missing_key") throw new LlmError("missing_key");
  if (fault === "timeout") {
    await sleep(1200);
    throw new LlmError("timeout", "Injected demo fault");
  }
  if (fault === "rate_limited") {
    throw new LlmError("rate_limited", "Injected demo fault", 6);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new LlmError("missing_key");

  let lastRetryable: LlmError | null = null;

  for (let attempt = 0; attempt <= MAX_TRANSPORT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          reasoning_effort: REASONING_EFFORT,
        }),
      });

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after")) || undefined;
        const body = await response.text().catch(() => "");
        lastRetryable =
          response.status === 429
            ? new LlmError("rate_limited", body.slice(0, 200), retryAfter)
            : new LlmError("upstream_error", `HTTP ${response.status}`);

        if (attempt < MAX_TRANSPORT_RETRIES) {
          // Honour the provider's own backoff when it sends one, capped so the
          // recruiter is never left staring at a spinner.
          const waitMs = Math.min((retryAfter ?? 2 ** attempt) * 1000, 15_000);
          await sleep(waitMs);
          continue;
        }
        throw lastRetryable;
      }

      if (response.status === 401 || response.status === 403) {
        throw new LlmError("missing_key", `HTTP ${response.status} from Groq`);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new LlmError("upstream_error", `HTTP ${response.status} ${body.slice(0, 200)}`);
      }

      const json = (await response.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
      };
      const choice = json.choices?.[0];
      const content = choice?.message?.content?.trim();

      if (choice?.finish_reason === "length") {
        throw new LlmError(
          "malformed_output",
          "Response hit the token limit and was cut off mid-JSON",
        );
      }
      if (!content) throw new LlmError("no_response");
      return content;
    } catch (error) {
      if (error instanceof LlmError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new LlmError("timeout", `No response within ${TIMEOUT_MS / 1000}s`);
      }
      throw new LlmError("upstream_error", (error as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastRetryable ?? new LlmError("upstream_error");
}

/**
 * Models occasionally wrap JSON in prose or fences even in JSON mode.
 * Recover what we can before deciding the output is unusable.
 */
function extractJson(raw: string): unknown {
  const candidates = [raw];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim());
    } catch {
      continue;
    }
  }
  throw new LlmError("malformed_output", "Response was not parseable JSON");
}

export type JsonCallOptions<T> = {
  messages: Message[];
  schema: ZodType<T, ZodTypeDef, unknown>;
  temperature?: number;
  maxTokens?: number;
  fault?: DemoFault | null;
  /** Labels the call in server logs, e.g. "plan" or "score:batch-2". */
  label: string;
  /**
   * Called when the first response failed validation and a repair was needed.
   * A silent recovery is still a thing the recruiter deserves to know about.
   */
  onRepair?: (reason: string) => void;
};

/**
 * The only way the rest of the app talks to the model.
 * Parse -> validate -> (one repair round trip) -> typed failure.
 */
export async function completeJson<T>({
  messages,
  schema,
  temperature,
  maxTokens,
  fault = null,
  label,
  onRepair,
}: JsonCallOptions<T>): Promise<T> {
  const started = Date.now();

  const attempt = async (msgs: Message[], injected: DemoFault | null) => {
    const raw =
      injected === "malformed"
        ? '{"filters": {"required_skills": "this should have been an array"'
        : await callGroq({ messages: msgs, temperature, maxTokens, fault: injected });
    return raw;
  };

  let raw = await attempt(messages, fault);

  try {
    const parsed = schema.parse(extractJson(raw));
    console.log(`[llm:${label}] ok in ${Date.now() - started}ms`);
    return parsed;
  } catch (firstError) {
    const reason =
      firstError instanceof LlmError
        ? (firstError.detail ?? firstError.message)
        : summariseZodError(firstError);

    console.warn(`[llm:${label}] invalid output, attempting repair: ${reason}`);
    onRepair?.(reason);

    // One repair round trip: hand the model its own output and the exact
    // complaint. Cheaper and far more reliable than failing the whole turn.
    raw = await attempt(
      [
        ...messages,
        { role: "assistant", content: raw.slice(0, 4000) },
        {
          role: "user",
          content: [
            "That response was rejected by the validator.",
            `Problem: ${reason}`,
            "Reply again with the corrected JSON object only. No prose, no code fences.",
          ].join("\n"),
        },
      ],
      // A repair attempt must be a real call, otherwise the injected fault
      // would loop forever.
      fault === "malformed" ? null : fault,
    );

    try {
      const repaired = schema.parse(extractJson(raw));
      console.log(`[llm:${label}] repaired in ${Date.now() - started}ms`);
      return repaired;
    } catch (secondError) {
      const detail =
        secondError instanceof LlmError
          ? secondError.detail
          : summariseZodError(secondError);
      throw new LlmError("malformed_output", detail);
    }
  }
}

function summariseZodError(error: unknown): string {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] })
    .issues;
  if (!issues?.length) return (error as Error).message ?? "unknown validation error";
  return issues
    .slice(0, 4)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

export const activeModel = () => DEFAULT_MODEL;
