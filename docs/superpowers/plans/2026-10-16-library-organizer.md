# Library Organizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Preserve source documents and organize them into reviewable question, experience and knowledge items with answer versions.
**Architecture:** Add Material.format and Material.structure JSON; keep content as a readable projection for existing search. Documents hold resumable drafts, derived items hold structured answers and source references. A dedicated account-scoped service owns changes and version checks.
**Tech Stack:** Next route handlers, React, Prisma/PostgreSQL, Zod, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-16-library-organizer-design.md

## Global Constraints
- Preserve originals and all old material records. Local additive migration only.
- No automatic confirmation, file writes, production migration or deploy.
- Reuse current working tree; do not commit unrelated in-progress work.

## Review Focus
- Source changes invalidate draft and completion, without erasing derived records.
- Empty answers and AI commentary remain distinct from personal facts.
- Concurrent confirmation cannot duplicate items or overwrite answers.
- Other accounts/archived targets cannot be linked or updated.
- Narrow screens and interrupted editing preserve explicit saved progress.

### Task 1: Structured storage and organizer service
Files: prisma/schema.prisma; migration; lib/library-organization.ts; lib/library-organizer-service.ts; app/api/library-organizer/route.ts; lib/material-notes.ts; tests/library-organization.test.ts; scripts/library-organizer-check.ts.
Interfaces: organizationItemSchema; materialFormat; renderOrganizedContent; handleLibraryOrganizer(userId,input).
- [x] Test pure structured rendering, missing answers, source validation, legacy document detection; observe RED then implement.
- [x] Add format/structure defaults; generate client and apply additive local migration.
- [x] Add create/promote/generate/saveDraft/confirm/append actions with CAS, account ownership, source quotes and all-or-nothing confirmation.
- [x] Exercise real local DB: partial confirmation/resume, duplicate/stale requests, append versions, ownership, source update invalidation.

### Task 2: Organizing and browsing UI
Files: components/library-organizer.tsx; components/structured-material.tsx; components/preparations.tsx; components/obsidian-library.tsx; app/globals.css; lib/types.ts.
Interfaces: LibraryOrganizer(document,onClose); SourceImport(onSaved); StructuredMaterial(item).
- [x] Source tab with processing state and derived counts, Word/text source import, old-material conversion.
- [x] Two-pane preview with editable typed fields, exact source excerpt, add/remove/select, existing question target, explicit save draft / confirm selected / mark complete.
- [x] Type filters and structured reading with source backlinks, versions and append-answer form; prevent legacy edits from desynchronizing projections.
- [x] Browser integration checks actual forms: import → preview → edit → partial confirm → resume → append → source; desktop/mobile.

### Task 3: Integration and verification
Files: lib/interview-service.ts; lib/assistant-library.ts; lib/assistant-context.ts; tests/assistant-library.test.ts; docs/interview-library-guide.md.
- [x] Regression test confirmed-item preference; label original sources, continue current query relevance.
- [x] Append mock interview answers as versions in structured questions; reject incompatible targets without altering documents.
- [x] Run npm test, npm run typecheck, DB/browser checks, npm run build:vinext, git diff --check.
- [x] Fresh reviewer, fix important findings with regression checks, document actual limits.

## Execution ledger
- Ruling: user approval already authorizes the design; continue native execution without another permission cycle.
- Ruling: keep existing dirty workspace to preserve prior local features; no branch commits/deploy in this task.

- Verification: 125 tests / 19 files passed; typecheck, local DB organizer/interview/assistant checks, Chrome organizer and interview flows passed; vinext production build and diff whitespace check passed.
- Real configured model smoke: synthetic interview only, 2 candidates, exact source quotes validated; no personal vault read.
- Fresh review P2 fixes: long paste is retained with explicit size error; metadata-only source edits preserve draft; manual/assistant reuse preserves structure and sources. Each regression reproduced then verified green.
- Ruling: skill helper script not present; tracked execution in the plan-local ignored ledger manually. No production migrations, GitHub push or deployment performed.
