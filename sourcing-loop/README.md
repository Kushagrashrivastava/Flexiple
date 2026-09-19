# Flexiple Sourcing — The Refinement Loop

A recruiter types what they are looking for in plain English. The app turns that
into **objective filters** it applies in code and a **subjective fit rubric** it
applies with an LLM, shows a handful of scored profiles with explanations that
quote the profile, and then lets the recruiter argue with it — in chat or with
per-profile yes/no — until the shortlist is right and they freeze it.

Built against the supplied 48-profile talent map. Every model call is real and
server-side; nothing in this repo is mocked or pre-computed.

---

## Run it

```bash
npm install
cp .env.example .env.local     # then paste your key into GROQ_API_KEY
npm run dev                    # http://localhost:3000
```

**Environment variable: `GROQ_API_KEY`** — a free key from
[console.groq.com/keys](https://console.groq.com/keys). It is read only on the
server, never shipped to the browser, and never committed.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | **yes** | Groq API key |
| `GROQ_MODEL` | no | Defaults to `openai/gpt-oss-120b` |
| `GROQ_REASONING_EFFORT` | no | Defaults to `low` — see *Decisions* |
| `DEMO_FAULTS` | no | `1` shows an "inject fault" control in the header for demonstrating failure handling |

Without a key the app shows a setup screen rather than an error — a first-run
mistake should read as a first-run mistake.

---

## The loop

1. **Free text → plan.** One LLM call returns `{ filters, rubric, interpretation }`,
   validated against a Zod schema. The interpretation line is shown back to the
   recruiter so any assumption the model made is visible immediately.
2. **Filter.** The filters are applied **in TypeScript**, not by the model
   (`src/lib/filters.ts`). Deterministic, instant, and explainable.
3. **Score.** Survivors are scored against the rubric in batches of 12 — one
   call covers most searches, so the model ranks the shortlist against itself
   rather than judging each profile in isolation. Each score carries evidence
   that cites a named profile field.
4. **Refine.** Chat feedback and/or per-profile yes/no go back with the current
   plan. The model returns an adjusted plan plus its reasoning; the app diffs the
   plan locally, shows exactly what moved, and re-runs the search.
5. **Freeze.** A single page: the brief, the frozen filters, the frozen rubric,
   and the full ranked shortlist.

---

## Decisions

**The LLM decides the rules; code enforces them.** The model never sees the
48 profiles when deciding who is eliminated — it produces a filter object, and
`applyFilters` does the cutting. So the hard cut is reproducible, costs nothing,
and can be explained to a candidate who asks why they were dropped. The model is
reserved for the part that genuinely needs judgement: scoring fit against the rubric.

**Explanations are verified, not trusted.** The scoring prompt requires every
claim to cite one of nine named profile fields and to quote it verbatim. On the
way back, `verifyEvidence` checks that the quoted string actually occurs in that
field of that specific profile, and silently drops anything that does not. If a
profile loses all of its evidence, the card says so rather than showing a
plausible sentence nobody can check. The count of dropped citations is reported
in the thread. This is the difference between a demo and something a recruiter
can act on.

**"What changed" is computed, not narrated.** When the plan is refined, the model
supplies the *reason* for each change, but the change list itself comes from
`diffFilters` / `diffRubric` comparing the plan before and after. A model that
narrates itself badly cannot produce a misleading change log.

**Progress is real.** Both routes stream NDJSON, so "Scored 16 of 23 profiles"
is the server's actual position, not a timed animation. It also means a slow
free-tier call degrades into a visibly-working UI instead of a frozen one.

**Failure is a designed state, not an exception.** Every failure mode is a typed
`LlmError` with its own title and recovery hint: missing key, rate limit,
timeout, malformed output, upstream error. Handling, in order:
transport retries with backoff (honouring `retry-after`) → one repair round trip
that hands the model its own output and the validator's exact complaint →
per-batch tolerance, so one bad scoring batch degrades the result and reports
itself instead of sinking the search → typed error card with a Retry that
re-runs the exact action that failed. `DEMO_FAULTS=1` exposes a header control to
trigger each of these on demand.

A recovery still gets said out loud. When a repair round trip succeeds, the
thread says so — "the model's first response failed validation, it was asked to
correct itself and did". Silently papering over a failure is how a tool loses
the right to be trusted about the things it does not mention.

**The validator clips cosmetics and rejects structure.** Length limits exist so
the UI stays readable, not because a long answer is wrong — so an over-long
summary or a sixth rubric signal is trimmed on arrival. An unknown enum value, a
missing field, or a score outside 0-100 still fails, because those change
meaning. Before this split, a chatty-but-correct response cost a full repair
round trip to fix something that was going to be trimmed anyway.

**Nothing disappears quietly.** If the model returns fewer scores than there
were candidates, the missing profiles are listed as "not scored" at the bottom
with a note, never dropped. For a sourcing tool, a silently vanished candidate
is the worst failure there is.

**Budgeted for the free tier.** Groq's free key allows 8,000 tokens per *minute*,
and `max_tokens` is reserved against that budget the moment a request is
accepted. Two concurrent scoring calls therefore rate-limit each other, so
scoring runs sequentially — the streamed progress makes that cost invisible.
`gpt-oss` is also a reasoning model whose reasoning tokens are spent from the
same completion budget before any JSON is written, which truncates the JSON
rather than failing loudly; `reasoning_effort` is set to `low` because these
calls are extraction and judgement, not puzzles. A `finish_reason` of `length`
is reported as its own error, since "ran out of budget" and "wrote nonsense"
need different fixes.

**The empty state does work.** If nothing clears the filters, the app reports how
many profiles each individual constraint would pass on its own, names the one
doing the most damage, and offers a one-click "relax this" that goes back through
the normal refinement path — so even the dead end stays inside the loop.

**One light theme, deliberately.** Sourcing is read-heavy. One well-tuned warm
palette beats two half-tuned ones, and consistency was worth more here than a
theme toggle.

### What I cut

- **Persistence, auth, multiple roles** — explicitly out of scope. State lives in
  React for the length of a session.
- **Directly editable filter chips.** Tempting, but the whole point of the
  assignment is the conversational loop; a manual override would have let me
  avoid proving the loop works. Refinement is the only way to change the plan.
- **Streaming the scores into the list as they arrive.** The batches finish
  within a second or two of each other on Groq; a settled list reads better than
  one that reshuffles under the cursor.
- **A second LLM provider.** One provider done properly — retries, repair,
  typed failures — was worth more than two done shallowly. The provider is
  isolated in `src/lib/llm/client.ts`; swapping it is one file.

---

## Where things are

```
data/profiles.json            the supplied talent map, loaded locally
src/lib/llm/prompts.ts        all three prompts, in one readable file
src/lib/llm/client.ts         Groq client: timeout, backoff, JSON repair, typed errors
src/lib/schemas.ts            every structured shape that crosses the LLM boundary
src/lib/filters.ts            deterministic filtering + citation verification
src/lib/pipeline.ts           plan → filter → score orchestration
src/lib/diff.ts               locally computed "what changed"
src/app/api/search/route.ts   first search  (NDJSON stream)
src/app/api/refine/route.ts   one refinement turn (NDJSON stream)
src/components/               the UI
```

`GET /api/health` reports whether the key is configured, the active model, and
the pool size.

---

## Known limits

- Skill and location matching is token-prefix matching on normalised strings:
  every token of the requirement must prefix-match a token of the candidate
  value. "RDS" matches "AWS RDS", "Node" matches "Node.js", "India" matches
  "Remote - India" — and, deliberately, requiring "AWS RDS" does *not* match
  someone whose only skill is "AWS". Plain substring matching gets that wrong,
  and this pool contains the exact pairs that expose it (`AWS`/`AWS RDS`,
  `SQL`/`PostgreSQL`, `Go`/`Django`). A real system would use an alias table.
- A search returning more than 12 profiles is scored in several calls. Within a
  call the ranking is genuinely relative; across a batch boundary it is
  calibrated by the rubric, so those comparisons are directionally right rather
  than exact. Ties are broken deterministically on visible signals.
- 48 profiles fit comfortably in context after filtering. At 98M, step 2 becomes
  a query against a real index and step 3 becomes a re-ranker over the top N —
  the shape of the loop does not change.
