# AGENTS.md — Codex Agent Instructions

## Overview
This repository uses a lightweight conversation checkpoint protocol to maintain continuity across Codex tasks.  The checkpoint is stored in `CHECKPOINT.md` and serves as the persistent state handoff between sessions.

## Using the checkpoint
Always read the latest `CHECKPOINT.md` before starting new work.  It contains the synopsis, key facts, open threads, user intent, assumptions, tone, next actions and a recap of recent messages.  Treat it as the authoritative context for your task.

## Updating the checkpoint
Whenever you make **any** change to the repository or complete a substantial step in your work, you must update `CHECKPOINT.md`.  Update the file using the schema defined below.  Do not wait for an explicit `/checkpoint` prompt—the checkpoint should always reflect the current state to maintain continuity of goals and actions.

## CHECKPOINT schema (must match exactly)
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

End after section 8.

## Repo conventions (fill in as needed)
- Install deps: (TODO)
- Run tests: (TODO)
- Lint/format: (TODO)
- Build: (TODO)
- CI notes: (TODO)

## Safety / security (optional defaults)
- Avoid introducing secrets into commits or logs.
- Avoid adding telemetry or network calls unless explicitly requested.
- Prefer deterministic, testable changes.
