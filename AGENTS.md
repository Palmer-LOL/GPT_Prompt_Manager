# AGENTS.md — Codex Agent Instructions

## Purpose (Authoritative)
This repository uses a lightweight “Conversation Checkpoint Protocol” to maintain continuity across Codex tasks.

**You MUST read this file and `CHECKPOINT.md` before starting work.**

## Operating Modes
Treat the following keywords as explicit mode switches when they appear in the user’s request:

- **CHECKPOINT**: Update `CHECKPOINT.md` using the exact schema in this repo (see below).
- **VERIFY**: Evaluate whether `CHECKPOINT.md` is sufficient to proceed safely; ask only *blocking* questions.
- **CONTINUE**: Proceed with implementation using `CHECKPOINT.md` as authoritative context.

> If the user uses `/checkpoint`, `/verify`, or `/continue`, interpret them as CHECKPOINT / VERIFY / CONTINUE.

## Global Rules
- Do not merge modes: never CHECKPOINT while continuing, and never CONTINUE while verifying.
- Best-effort only; do not claim completeness or verbatim accuracy.
- Prefer recent, relevant context from `CHECKPOINT.md` and the repository.
- Clearly separate distinct topics/projects if present.
- If instructions conflict: prefer the user’s latest explicit request, then this file, then `CHECKPOINT.md`.

## Workflow
1. Read `CHECKPOINT.md`.
2. If user requested **VERIFY**: produce a verification report (see “VERIFY Output”).
3. If user requested **CONTINUE**: do the work. Make changes in small, reviewable commits when possible.
4. If user requested **CHECKPOINT**: update `CHECKPOINT.md` and stop.

## CHECKPOINT Schema (must match exactly)
When updating `CHECKPOINT.md`, use this exact structure:

- Conversation Checkpoint
  1) Synopsis (1 paragraph)
  2) Key facts & decisions (bullets)
  3) Open threads / unresolved questions (bullets)
  4) User intent & success criteria (bullets; mark inferred as **Inferred**)
  5) Assumptions & risks (bullets; mark inferred as **Inferred**)
  6) Tone / mood read (1–3 bullets; **Inferred**)
  7) Next actions (numbered list, 3–7 items)
  8) Last 10 messages (best-effort recap, chronological, label speakers)

End after section 8.

## VERIFY Output (format)
When producing a verification report, use:

- Checkpoint Verification
  1) Sufficiency assessment (Sufficient / Partially sufficient / Insufficient + 1 sentence)
  2) Missing or ambiguous context (bullets; label Blocking or Non-blocking)
  3) Assumptions currently being made (bullets; **Inferred**)
  4) Risk assessment (Low/Medium/High + brief)
  5) Clarifying questions (only if needed; minimum)
  6) Recommendation (Proceed now / Proceed with caution / Request clarification)

## Repo Conventions (fill in as needed)
- Install deps: (TODO)
- Run tests: (TODO)
- Lint/format: (TODO)
- Build: (TODO)
- CI notes: (TODO)

## Safety / Security (optional defaults)
- Avoid introducing secrets into commits or logs.
- Avoid adding telemetry or network calls unless explicitly requested.
- Prefer deterministic, testable changes.
