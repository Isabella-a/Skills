# Code Review Best Practices

Comprehensive guidelines for conducting effective code reviews on this monorepo.

## Review Philosophy

### Goals of Code Review

**Primary Goals:**
- Catch bugs and edge cases before production
- Ensure code maintainability and readability
- Share knowledge across the team
- Enforce this repo's standards consistently (see app-level `CLAUDE.md` files)
- Improve design and architecture decisions

**Secondary Goals:**
- Mentor developers
- Build team culture and trust
- Document design decisions through discussion

### What Code Review is NOT

- A gatekeeping mechanism to block progress
- An opportunity to show off knowledge
- A place to nitpick formatting — ESLint/Prettier via `lint-staged` already enforce this
- A way to rewrite code to personal preference when the existing approach already works

## Review Timing

### When to Review

| Trigger | Action |
|---|---|
| PR opened | Review within 24 hours, ideally same day |
| Changes requested | Re-review within 4 hours |
| Blocking issue found | Communicate immediately |

### Time Allocation

- **Small PR (<100 lines)**: 10-15 minutes
- **Medium PR (100-400 lines)**: 20-40 minutes
- **Large PR (>400 lines)**: Request to split, or 60+ minutes

## Review Depth Levels

### Level 1: Skim Review (5 minutes)
- Check PR description and linked Jira issue
- Verify CI status (lint, type-check, tests)
- Look at the file changes overview — does it touch `apps/backend`, `apps/frontend`, or both?
- Identify if deeper review is needed

### Level 2: Standard Review (20-30 minutes)
- Full code walkthrough
- Logic verification
- Test coverage check
- Security scan

### Level 3: Deep Review (60+ minutes)
- Architecture evaluation
- Performance analysis
- Security audit
- Edge case exploration

## Communication Guidelines

### Tone and Language

Comments for humans on this repo's PRs should be written in **português brasileiro**, per `/CLAUDE.md`.

**Use collaborative language:**
- "O que acha de..." instead of "Você deveria..."
- "Podemos considerar..." instead of "Isso está errado"
- "Fiquei em dúvida sobre..." instead of "Por que você não fez..."

**Be specific and actionable:**
- Include code examples when suggesting changes
- Link to relevant sections of `apps/backend/CLAUDE.md` / `apps/frontend/CLAUDE.md` or past discussions
- Explain the "why" behind suggestions

### Handling Disagreements

1. **Seek to understand**: ask clarifying questions
2. **Acknowledge valid points**: show you've considered their perspective
3. **Provide data**: benchmarks, docs, or examples
4. **Escalate if needed**: involve a senior dev
5. **Know when to let go**: not every hill is worth dying on

## Review Prioritization

### Must Fix (Blocking)
- Security vulnerabilities
- Data corruption risks (missing `UnitOfWork` around multi-repository writes, unsafe migrations)
- Breaking changes without a migration/rollout plan
- Critical performance issues (N+1 in a hot path)
- Missing error handling for user-facing features

### Should Fix (Important)
- Test coverage gaps
- Moderate performance concerns
- Code duplication
- Unclear naming or structure
- Missing documentation for genuinely non-obvious logic

### Nice to Have (Non-blocking)
- Style preferences beyond linting
- Minor optimizations
- Additional test cases
- Documentation improvements

## Anti-Patterns to Avoid

### Reviewer Anti-Patterns
- **Rubber stamping**: approving without actually reviewing
- **Bike shedding**: debating trivial details extensively
- **Scope creep**: "while you're at it, can you also..."
- **Ghosting**: requesting changes then disappearing
- **Perfectionism**: blocking for minor style preferences already covered by ESLint/Prettier

### Author Anti-Patterns
- **Mega PRs**: submitting 1000+ line changes spanning unrelated concerns
- **No context**: missing PR description or linked Jira issue
- **Defensive responses**: arguing every suggestion
- **Silent updates**: making changes without responding to comments

## Metrics and Improvement

### Track These Metrics
- Time to first review
- Review cycle time
- Number of review rounds
- Defect escape rate
- Review coverage percentage

### Continuous Improvement
- Hold retrospectives on the review process
- Share learnings from escaped bugs
- Update this skill's checklists based on recurring issues
- Celebrate good reviews and catches
