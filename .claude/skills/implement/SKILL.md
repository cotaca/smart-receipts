---
name: implement
description: SmartReceipts change loop — clarify, plan, approve, delegate the build, review, verify, hand over. Use only for non-trivial changes — more than 3 files, a new dependency, an API/DB schema/Settings change, or an open design decision — or when the user runs /implement.
---

# Implement a non-trivial change

Task: $ARGUMENTS

## 1. Clarify
Resolve open decisions with `AskUserQuestion` before planning: each option with its trade-off, your recommendation first. Never plan around an unresolved fork. Skip when nothing is open.

## 2. Plan — main thread, plan mode
Read the code the plan rests on yourself; check every load-bearing claim ("X already exists", "Y is only called from Z") instead of assuming it. Use the built-in Explore subagent only for broad searches. The plan names:
- files to change, and why
- tests — for a bug, the test that fails first
- which `.claude/rules/` file changes (and the ARCHITECTURE.md row, if an area appears or disappears)
- the commit split

Get approval by exiting plan mode before any edit.

## 3. Build
Hand the approved plan, verbatim, to the `implementer` subagent. Its stop gate keeps it working until `scripts/check.sh` is green.

## 4. Review
Delegate to the `reviewer` subagent. You get findings, missing doc updates and visual checks back — not the diff.
If the diff touches frontend UI and the reviewer listed visual checks, pass them to `ui-verifier` (the user must have the dev stack running; ask if unsure).

## 5. Fix and verify
Send the findings and failed visual checks to `implementer`. Then reproduce each fix yourself: rerun the exact test, case or visual check behind the finding — a subagent's report is not evidence.
At most 2 review → fix rounds; after that, stop and list what's still open.

## 6. Hand over
- `scripts/check.sh`: all green, or what isn't and why
- visual checks: passed, failed, or not run (and why)
- Conventional Commit messages, each with its files
- which docs changed

Never stage, commit or push.
