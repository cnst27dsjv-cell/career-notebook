# Interview preparation and local notes implementation plan

**Goal:** Repair research and create a usable practice-to-library workflow, including existing Obsidian Markdown interviews without paid Sync.
**Spec:** docs/reviews/2026-10-12-interview-preparation-audit.md; user authorized implementation on 2026-10-12 and clarified existing Obsidian interviews.
**Architecture:** Use Tavily for public research. Preserve interview state in an additive JSON column; existing sessions default to empty state. Store selected material/resume snapshots with the session. Browser-granted directory handles read selected Markdown; explicit import/update and conflict-checked writeback use existing Material revisions.
**Tech Stack:** React, Next route handlers, Prisma/PostgreSQL, Tavily, configured text model, File System Access API with Markdown file fallback.

## Constraints
- No credentials in tracked files; no automatic production deployment.
- Existing notes are data, not instructions; only selected notes enter account storage and model context.
- No automatic overwrites of local notes; compare original content before explicit writeback.
- Keep every answer attempt and confirmed material revision. Model failure preserves saved research and answers.
- Browser folder permissions replace server-wide filesystem access. Folder connection lasts for current page session; import works on unsupported browsers.

## Review focus
- Existing/foreign account IDs must not grant context or update access.
- Failed search/generation must leave a recoverable preparation/session.
- Editing a previously reviewed answer must retain history and invalidate stale review.
- Re-import and simultaneous material edits must not duplicate or overwrite silently.
- Local file modified after preview must stop writeback.

## Task 1: Research and interview service
Files: lib/interview-practice.ts, lib/interview-service.ts, app/api/interviews/route.ts, lib/types.ts, prisma/schema.prisma, prisma/migrations/20261012090000_interview_state/migration.sql; tests/interview-practice.test.ts, tests/interview-service.test.ts.
- [x] Write failing tests for source mapping, no-private-content search, history preservation, invalid citations and existing-answer context.
- [x] Add state column (additive migration), context loading with ownership checks, saved research, generation retry, feedback/followup/review/progress and confirmation updates with version checks.
- [x] Run targeted tests and typecheck.

## Task 2: Practice UI and library revisions
Files: components/interview.tsx, components/interview-setup.tsx, components/preparations.tsx, app/api/ai/route.ts, app/api/data/route.ts.
- [x] Add selected materials/resume, source preview and editable questions, no-search fallback.
- [x] Preserve autosave ordering, enable followup/end/review, restore progress and update selected existing answer.
- [x] Align legacy search status/test and legacy answer persistence. Validate browser behavior and tests.

## Task 3: Obsidian note exchange
Files: lib/markdown-library.ts, lib/local-notes.ts, app/api/material-notes/route.ts, components/obsidian-library.tsx; tests/markdown-library.test.ts, tests/local-notes.test.ts; scripts/interview-library-check.ts (real database import coverage).
- [x] Write failing tests for exact-content import, duplicate detection, version conflict and changed-file write rejection.
- [x] Add selected-folder/file preview, import/update with account-scoped stable source, full-text library use and explicit safe writeback; Markdown downloads for sessions.
- [x] Run all tests, typecheck and Cloudflare build. Independent review and fix significant findings.

## Decisions
- Implement in current checkout to keep existing local preview usable; no isolation requested.
- User authorized code work; proceed through plan without repeating approval gates.
- Path question is optional: the user chooses the folder in the product, no server path required.

## Verification and implementation notes (2026-10-13)
- 115 tests across 17 files pass; typecheck, Cloudflare production build and git diff --check pass.
- Real local PostgreSQL integration covers simultaneous note imports, revisions, ownership, stale versions, repeat confirmation and original transcript preservation. This replaces the planned mocked material-notes unit test with stronger database coverage.
- Chrome component + local database acceptance covers Markdown import, selected context, editable questions, answer autosave, quick navigation away/reopen, feedback, append to existing notes, follow-up, review, Markdown export and 390px mobile width. AI is stubbed only in this repeatable browser check.
- Separate real Tavily + DeepSeek check using synthetic input passed: five sources, five questions, feedback/suggestion, follow-up and whole-session review. Fixtures were deleted.
- Interactive interview calls use the configured default text model. DeepSeek requests explicitly disable extended thinking; this option does not change other features or other providers. The real test originally caught a slow polishing model and reasoning-token exhaustion.
- Independent review findings fixed: workspace session cache, question/source consistency on retry, preserved research on no-search fallback, refreshed note previews.
- Folder read/write permission and changed-file conflict paths have unit coverage. The OS directory picker and writing into a real personal vault have not been exercised; the browser acceptance uses Markdown file import.
- Additive migration applied only to the local database. GitHub and production are not updated by this task.
