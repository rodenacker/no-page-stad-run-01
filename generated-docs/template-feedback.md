# Template feedback

Append-only notes for the template maintainers. Logged by agents that hit a bug in
the template itself and worked around it. Notes, not blockers.

## [template] `code-review-runner` cannot invoke the `/code-review` skill it is built around

- Symptom: at EPIC-END Step B7.0.5 the `code-review-runner` agent could not run
  `/code-review --fix`. `Skill code-review` is refused as `disable-model-invocation`,
  so the agent cannot invoke it at all. Separately, the skill that the name
  `code-review` currently resolves to is
  `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/code-review/commands/code-review.md`
  — a GitHub-PR-comment pipeline that spawns its own subagents and calls
  `gh pr comment`, and which has no `--fix` flag. So even if it were invokable it is
  not the reviewer this step wants: at B7.0.5 there is no PR yet (the PR is opened
  later, at B7.2.2), and the step's whole contract is that fixes are applied to the
  working tree.
- Workaround applied: the runner performed the equivalent branch-diff review itself
  (per the fallback in its own instructions), applied its fixes to the working tree,
  and wrote the findings file in the documented shape. The orchestrator read the file
  and routed the unresolved findings through the developer fix cycle as normal, so the
  epic-end gate behaved correctly end to end.
- Suggested fix: decide which of these the step actually wants and make it explicit,
  rather than leaving the agent to resolve a name collision at runtime —
  (a) ship a template-owned review skill under a name that cannot collide with a
  marketplace plugin (e.g. `stadium-code-review`) and reference that name in
  `code-review-runner.md`; or (b) drop the skill dependency and specify the
  branch-diff review directly in the agent's own instructions, which is what the
  fallback path already does successfully. Either way, `code-review-runner.md` should
  stop naming a skill it cannot invoke, and the `disable-model-invocation` refusal
  should be called out in its Troubleshooting so the fallback is not mistaken for a
  failure.
- Affected: `.claude/agents/code-review-runner.md`, `.claude/commands/continue.md`
  (Step B7.0.5). Observed on epic `file-validation-and-retry`, 2026-08-06.
