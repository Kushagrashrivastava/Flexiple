/**
 * Every way an LLM call can fail, named. The UI branches on `code`, so a rate
 * limit reads differently from a malformed response — the recruiter always
 * learns what happened and what to do about it.
 */
export type LlmErrorCode =
  | "missing_key"
  | "rate_limited"
  | "timeout"
  | "malformed_output"
  | "upstream_error"
  | "no_response";

const MESSAGES: Record<LlmErrorCode, { title: string; hint: string }> = {
  missing_key: {
    title: "No LLM API key configured",
    hint: "Set GROQ_API_KEY in .env.local and restart the dev server.",
  },
  rate_limited: {
    title: "The model is rate limited",
    hint: "The free tier is busy. Waiting a few seconds and retrying usually clears it.",
  },
  timeout: {
    title: "The model took too long",
    hint: "The request was cancelled after 30s. Retry, or narrow the brief.",
  },
  malformed_output: {
    title: "The model returned something we could not use",
    hint: "We asked it to repair the output once and it failed again. Retrying usually works.",
  },
  upstream_error: {
    title: "The model provider returned an error",
    hint: "This is upstream of the app. Retry in a moment.",
  },
  no_response: {
    title: "The model returned an empty response",
    hint: "Nothing came back to validate. Retry.",
  },
};

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly detail?: string;
  /** Seconds the provider asked us to wait, when it told us. */
  readonly retryAfter?: number;

  constructor(code: LlmErrorCode, detail?: string, retryAfter?: number) {
    super(`${MESSAGES[code].title}${detail ? `: ${detail}` : ""}`);
    this.name = "LlmError";
    this.code = code;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }

  get httpStatus() {
    switch (this.code) {
      case "missing_key":
        return 500;
      case "rate_limited":
        return 429;
      case "timeout":
        return 504;
      default:
        return 502;
    }
  }

  toPayload(): { error: LlmErrorPayload } {
    return {
      error: {
        code: this.code,
        title: MESSAGES[this.code].title,
        hint: MESSAGES[this.code].hint,
        detail: this.detail,
        retryAfter: this.retryAfter,
      },
    };
  }
}

export type LlmErrorPayload = {
  code: LlmErrorCode | "bad_request";
  title: string;
  hint: string;
  detail?: string;
  retryAfter?: number;
};
