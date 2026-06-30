# Specialist Routing

Use specialists when they reduce risk, improve quality, or provide a focused expert lens. Do not use them for tiny obvious work.

Specialists do not own project memory. They must not edit `kis/`. They may report KIS-relevant updates for the orchestrator to classify and write.

## Availability Rule

If a matched specialist skill or subagent tool is unavailable:

1. Say what is unavailable.
2. If installation or enablement is supported and the work is Standard/Phase risk, ask for approval or use the available install flow.
3. If unavailable tooling blocks the ideal path, create a checkpoint.
4. Continue only when the user enables the tool, reduces scope, switches to Fast Mode, or explicitly accepts fallback risk.

Do not silently pretend an unavailable specialist ran. Do not deadlock when a safe fallback is accepted.

## Common Routing

```text
Which skill fits?              -> ask-matt
Idea unclear / need thinking?  -> grill-me
Requirements need structure?   -> to-prd
Break plan into issues?        -> to-issues
Domain/terminology unclear?    -> grill-with-docs / domain-modeling
Architecture risky?            -> improve-codebase-architecture / grill-me
Architecture diagram?          -> excalidraw-diagram / visualize
Deep module design?            -> codebase-design
Implement feature or bugfix?   -> tdd
End-to-end / browser test?     -> webapp-testing
Hard bug or regression?        -> diagnosing-bugs
Triage incoming issues?        -> triage
Explore a design fast?         -> prototype
Web UI/design?                 -> frontend-design / ui-ux-pro-max
React/Next.js implementation?  -> react-best-practices
Auth / login / accounts?       -> create-auth-skill
API design?                    -> engineering:system-design (or api-design-principles)
Mobile design?                 -> sleek-design-mobile-apps / ui-ux-pro-max
UI review?                     -> web-design-guidelines / ui-ux-pro-max
Code review?                   -> /code-review (or requesting-code-review)
Security review?               -> /security-review (or security-auditor)
Hand off to another session?   -> handoff
```

`ask-matt` routes over the user-invoked skills when the right fit is unclear. Model-invoked skills (`tdd`, `diagnosing-bugs`, `domain-modeling`, `codebase-design`, `grilling`) the orchestrator runs itself; the rest are usually user-invoked.

Skip a matched skill only with a one-line reason.

## Agent Selection

Use one specialist when:

- task is small
- risk is low
- changes are localized
- orchestrator can review directly

Use implementer + reviewer when:

- code changes are non-trivial
- visible UI changes
- user behavior changes
- architecture/data flow changes
- regression risk exists

Use multiple agents when:

- feature spans frontend and backend
- mobile and web both change
- architecture is uncertain
- plan needs challenge before execution
- independent review would catch meaningful risk

## Dispatch Brief

Before launching a specialist, prepare:

```text
Role:
Skill:
Task:
Relevant KIS context:
Relevant files:
Constraints:
Acceptance criteria:
Commands to run:
Expected proof:
KIS boundary:
```

Required KIS boundary:

```text
Do not modify kis/.

Report any KIS-relevant updates under this heading:

KIS-relevant updates:
- Knowledge:
- Intent:
- State:

Only the KIS orchestrator updates KIS.
```

## Report Handling

Treat specialist reports as claims. Verify:

- changed files actually changed
- commands were actually run where possible
- test output is credible
- implementation matches the task
- no unrelated changes were made
- `kis/` was not modified by the specialist
- KIS updates are routed to the right layer

Preferred report:

```text
Summary:
- ...

Changed files:
- ...

Commands run:
- ...

Proof:
- ...

Issues / risks:
- ...

KIS-relevant updates:
- Knowledge:
- Intent:
- State:
```

If no KIS update is needed:

```text
KIS-relevant updates:
- none
```

## Install Notes

When the environment supports skill installation, these are useful KIS companions:

```bash
npx skills add https://github.com/mattpocock/skills --skill ask-matt
npx skills add https://github.com/mattpocock/skills --skill grill-me
npx skills add https://github.com/mattpocock/skills --skill grill-with-docs
npx skills add https://github.com/mattpocock/skills --skill to-prd
npx skills add https://github.com/mattpocock/skills --skill to-issues
npx skills add https://github.com/mattpocock/skills --skill triage
npx skills add https://github.com/mattpocock/skills --skill prototype
npx skills add https://github.com/mattpocock/skills --skill improve-codebase-architecture
npx skills add https://github.com/mattpocock/skills --skill diagnosing-bugs
npx skills add https://github.com/mattpocock/skills --skill tdd
npx skills add https://github.com/mattpocock/skills --skill domain-modeling
npx skills add https://github.com/mattpocock/skills --skill codebase-design
npx skills add https://github.com/mattpocock/skills --skill handoff
npx skills add https://github.com/anthropics/skills --skill frontend-design
npx skills add https://github.com/anthropics/skills --skill webapp-testing
npx skills add https://github.com/vercel-labs/agent-skills --skill react-best-practices
npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
npx skills add https://github.com/sleekdotdesign/agent-skills --skill sleek-design-mobile-apps
npx skills add https://github.com/better-auth/skills --skill create-auth-skill
npx skills add https://github.com/coleam00/excalidraw-diagram-skill --skill excalidraw-diagram
```

Code and security review need no install: use the built-in `/code-review` and `/security-review` commands (current branch, a PR, or `/code-review ultra` for cloud review). `superpowers:requesting-code-review` is an optional skill-based alternative. The matt pocock repo has no `review` skill.

`react-best-practices` (Vercel) covers both React and Next.js — there is no separate `vercel-react-best-practices` or `next-best-practices` skill. `visualize` is the built-in diagram MCP (no install); `excalidraw-diagram` is the installable alternative.

For API design prefer the built-in `engineering:system-design` skill (no install). The antigravity `api-design-principles` skill has no single-skill install — `npx antigravity-awesome-skills --claude` pulls the full 1,600+ skill library, so only use it if you want the whole bundle.
