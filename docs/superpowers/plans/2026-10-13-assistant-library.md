# Assistant library retrieval implementation plan

**Goal:** Automatically use relevant imported interview notes in assistant chats, with readable evidence.
**Architecture:** Account-scoped database candidates → Chinese word ranking and relevant excerpts → bounded existing context → persisted evidence rendered on reply.
**Tech Stack:** TypeScript, Prisma, existing model route, React.
**Spec:** docs/superpowers/specs/2026-10-13-assistant-library-design.md

## Constraints and review focus
No background filesystem access, credentials, migrations, or production deployment. Preserve pending work. Current question should outrank stale chat topics. Never expose other accounts or archived notes. Evidence must match final bounded model payload, not discarded candidates. Imported text is untrusted and may be unverified. Preserve existing action confirmation rules.

## Tasks
- [x] 1. Write failing tests for Chinese natural questions, older relevant records, tail excerpts, unrelated records and query priority. Implement `lib/assistant-library.ts` pure ranking/excerpt helpers; run tests.
- [x] 2. Integrate account-scoped candidate search in `lib/assistant-context.ts`, keep recent user messages separate from current question in `app/api/assistant/route.ts`. Add persisted optional `materialEvidence` to AssistantPlan with actual excerpt/version/path; render in `components/assistant.tsx`. Verify DB isolation and payload/evidence agreement.
- [x] 3. Run full tests, typecheck, local database/route/browser acceptance, production build and independent review. Document result and known lexical-retrieval limitation.

## Decisions
- Implement inline in existing checkout to preserve the preceding tested work and local preview. No commits/push/deployment in this task.
- User approved the two-stage recommendation; this task implements stage one only.

## Verification ledger
- Chinese/tail/current-topic/follow-up retrieval: five tests observed failing before implementation, then passing.
- Real local DB regression observed natural Chinese retrieval returning no notes before integration; now passes account/archived filtering, updates, evidence snapshots and context budget checks.
- Independent review found active draft material references could disappear from top-six results. Reproduced “关联资料不可用” then fixed via account-scoped metadata retained separately from model evidence. Additional budget-trimming reproduction “资料引用无效” also fixed; both database regressions pass.
- Authenticated route + Chrome acceptance passed automatic retrieval, saved evidence expansion, updated note on follow-up, original evidence after reload and mobile width. External AI response is stubbed in this reproducible test; inputs are captured to verify actual model context. No personal note or live model request used in this task.
- Full suite: 120 tests / 18 files; typecheck, local DB acceptance, Cloudflare build and diff check pass.
- No new schema migration. No GitHub push or production deployment.
- Decision: lexical retrieval first; synonyms without overlapping keywords may be missed. Local folder monitoring remains the second stage.
