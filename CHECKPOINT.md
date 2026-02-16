Conversation Checkpoint

1) Synopsis (1 paragraph)
The user reported that the previous token implementation was too heavy because it calculated all visible prompts at once, and requested an on-demand per-item workflow with persistence. The userscript was updated so token counting on the Insert tab is now manual via a per-item “Calc tokens” button, the calculated token count is stored on that prompt/checkpoint record for later reuse, cached totals are shown in the Insert summary, and token values are visually marked inline on each card.

2) Key facts & decisions (bullets)
- Removed eager per-render token counting across all visible Insert items.
- Added per-item `Calc tokens` action in Insert cards.
- Persisted token metadata on items: `tokenCount`, `tokenEncoding`, `tokenCountUpdatedAt`.
- Insert summary now reports cached totals and how many items are still uncalculated.
- Existing visual token display is now explicit per card (`🧮 Tokens...`) and uses cached values.
- Reset token metadata to null when prompt/checkpoint body is saved/edited to avoid stale counts.
- Bumped userscript version to `0.6.2`.

3) Open threads / unresolved questions (bullets)
- Confirm whether user wants a bulk “calculate all in category/filter” utility in addition to per-item mode.
- Confirm whether token metadata should be included in exported schema docs/user-facing README notes.

4) User intent & success criteria (bullets; mark inferred as **Inferred**)
- Avoid expensive all-at-once token computation in the browser tab.
- Trigger token counting per prompt/checkpoint on demand.
- Persist computed counts with each item for future visibility.
- Provide clear on-card token visibility in the prompt display.

5) Assumptions & risks (bullets; mark inferred as **Inferred**)
- **Inferred**: Manual per-item counting is preferred over automatic freshness when content changes.
- Token metadata can become stale after edits, so saves now explicitly reset cached values.
- **Inferred**: Additional stored fields are acceptable in library JSON even if not required by validation.

6) Tone / mood read (1–3 bullets; **Inferred**)
- **Inferred**: Frustrated with performance overhead from prior implementation.
- **Inferred**: Wants pragmatic UX that remains responsive and explicit.

7) Next actions (numbered list, 3–7 items)
1. Validate in Tampermonkey that per-item token calc and caching behave as expected.
2. Confirm card display wording/icons are to user preference.
3. Optionally add a deliberate batch-calc action with explicit user trigger (not automatic).
4. Update README/export notes if token metadata visibility needs documentation.

8) Last 10 messages (best-effort recap, chronological, label speakers)
- User: Re-shared AGENTS instructions and context.
- User: Reported dissatisfaction with prior codex output and included prior diff summary.
- User: Requested changing behavior to per-prompt calculation with persistence and visible token display.
- Assistant: Reviewed checkpoint/history and inspected token-render code paths.
- Assistant: Replaced eager Insert token computation with on-demand per-item calculation + caching.
- Assistant: Added cached total summary messaging and visual per-card token indicator.
- Assistant: Added cache invalidation on prompt/checkpoint save edits.
- Assistant: Ran syntax check.
