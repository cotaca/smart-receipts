# Claude Code — SmartReceipts

Read [AGENTS.md](AGENTS.md) for the rules that apply to everyone working here,
and [ARCHITECTURE.md](ARCHITECTURE.md) for why the code looks the way it does.
Everything below is Claude Code specific and doesn't apply to human contributors.

## Default mode

Use the `ponytail:ponytail` skill by default, not only when asked for it: keep
replies short, keep token usage low, and take the simplest solution that
actually holds — reuse a helper that already exists before writing one, reach
for the platform or standard library before a new dependency, and don't build an
abstraction with a single implementation.

Not subject to that: input validation at trust boundaries, error handling that
prevents data loss, security, and accessibility. Those get built properly.

## The implementation loop

Every non-trivial step runs the same way:

1. Clarify open decisions with `AskUserQuestion` — each option with its trade-off.
2. A **plan subagent** drafts the plan (plan only, no code).
3. Review that plan yourself: verify its load-bearing claims against the actual
   code, name the gaps, ask follow-ups if they change the work, then write the
   final plan.
4. Get it approved via plan mode before anything is implemented.
5. An **implementation subagent** builds the approved plan.
6. Review the result with the `engineering-advanced-skills:pr-review-expert`
   skill against the working-tree diff — there's usually no real PR.
7. A subagent fixes the findings; then reproduce each fix yourself. See the two
   cautionary cases in AGENTS.md for why a subagent's report isn't proof.
8. Repeat 6–7 until clean.

**All subagents run with `model: "sonnet"`.**

## Standing constraints

- Never commit, stage or push — see AGENTS.md.
- Every loop ends with commit messages, their file mapping, and an
  ARCHITECTURE.md update.
