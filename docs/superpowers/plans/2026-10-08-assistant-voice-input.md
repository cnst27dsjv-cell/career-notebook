# AI Assistant Voice Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a microphone control that converts Chinese speech into editable assistant input without the application uploading or storing audio. Browser recognition may use an online service.

**Architecture:** A focused client Hook owns browser capability detection and the `SpeechRecognition` lifecycle. Small pure helpers normalize transcript insertion and browser errors so the Node test suite can exercise user-visible behavior; the existing assistant component only connects the Hook to its controlled textarea and renders state.

**Tech Stack:** React 19, TypeScript, browser Web Speech API, Phosphor icons, Vitest 5, CSS.

**Spec:** `docs/superpowers/specs/2026-10-08-assistant-voice-input-design.md`

## Global Constraints

- Default recognition language is exactly `zh-CN`.
- Recognition text is appended to existing input, remains editable, and is never sent automatically.
- The application does not create, store, or upload audio.
- Unsupported browsers and recognition errors must leave ordinary text input usable.
- Do not add a server endpoint, database field, third-party speech dependency, or audio-message mode.

## Review Focus

- Existing text ending in Chinese punctuation or whitespace: append one readable separator without deleting or duplicating content; cover in Task 1 transcript tests.
- Multiple final result segments in one recognition event: combine them in order exactly once; cover in Task 1 result tests.
- Permission denial, no speech, and generic service failure: map to distinct short Chinese recovery messages; cover in Task 1 error tests.
- Sending or unmounting while listening: stop recognition and leave the input value intact; verify through Task 1 lifecycle logic and Task 2 manual check.
- Unsupported mobile browsers: preserve textarea and send behavior while showing the system-keyboard fallback; verify in Task 2 responsive/manual check.

---

### Task 1: Browser speech recognition boundary

**Files:**
- Create: `components/use-speech-recognition.ts`
- Create: `lib/speech-input.ts`
- Test: `tests/speech-input.test.ts`

**Interfaces:**
- Consumes: browser globals `window.SpeechRecognition` or `window.webkitSpeechRecognition` when present.
- Produces: `mergeSpeechInput(current: string, transcript: string): string`, `collectFinalTranscript(results: SpeechResultListLike): string`, `speechErrorMessage(code: string): string`, and `useSpeechRecognition({ onTranscript }): { supported: boolean | null; listening: boolean; stopping: boolean; error: string; start(): void; stop(): void; cancel(): void }`. A `null` support value means capability detection has not completed, preventing a false unsupported message during hydration.

- [x] **Step 1: Write failing pure-helper tests**

Add tests asserting that `mergeSpeechInput` trims an empty transcript, preserves empty/current text, inserts one separator after existing text, and preserves ordered Chinese/English terms. Test `collectFinalTranscript` with multiple ordered final segments plus an ignored interim segment. Add tests asserting distinct messages for `not-allowed`/`service-not-allowed`, `no-speech`, `audio-capture`, and an unknown failure.

- [x] **Step 2: Run the focused test and verify failure**

Run: `npm test -- tests/speech-input.test.ts`

Expected: FAIL because `lib/speech-input.ts` does not exist.

- [x] **Step 3: Implement the pure helpers**

Create the exact exported signatures `mergeSpeechInput(current: string, transcript: string): string`, `collectFinalTranscript(results: SpeechResultListLike): string`, and `speechErrorMessage(code: string): string` in `lib/speech-input.ts`; keep copy concise and actionable.

- [x] **Step 4: Run the focused test and verify pass**

Run: `npm test -- tests/speech-input.test.ts`

Expected: all speech-input tests PASS.

- [x] **Step 5: Implement the Hook**

Create `components/use-speech-recognition.ts` as a client Hook. Define the minimal local browser interfaces needed for TypeScript, configure a newly created recognition instance with `lang = "zh-CN"`, `continuous = true`, and `interimResults = false`, collect every final result segment in order, surface normalized errors, and keep final-result callbacks until explicit stop finishes; cancel and clear callbacks on unmount or conversation changes.

- [x] **Step 6: Run type checking**

Run: `npm run typecheck`

Expected: PASS with no browser-global or React lifecycle errors.

- [x] **Step 7: Commit the speech boundary**

```bash
git add components/use-speech-recognition.ts lib/speech-input.ts tests/speech-input.test.ts
git commit -m "feat: add browser speech recognition hook"
```

### Task 2: Assistant composer interaction and presentation

**Files:**
- Modify: `components/assistant.tsx:2-26,68-90,126-170,730-759`
- Modify: `app/globals.css:3222-3269,3325-3337`

**Interfaces:**
- Consumes: `useSpeechRecognition({ onTranscript })` and `mergeSpeechInput` from Task 1.
- Produces: a labelled microphone toggle in the existing assistant composer, a live listening status, and an unsupported/error fallback that does not block typing or sending.

- [x] **Step 1: Connect recognition to controlled input**

Import the Phosphor `Microphone` icon and the Task 1 Hook/helper. Instantiate the Hook with an `onTranscript` callback that uses functional `setInput` plus `mergeSpeechInput`, then refocuses `composer`. Disable sending until recognition ends, then cancel any stale session before `send()` begins.

- [x] **Step 2: Render accessible controls and messages**

Insert a `type="button"` microphone button before the submit button when supported. Use `aria-label` values `开始语音输入` and `停止语音输入`, `aria-pressed`, and an `assistant-voice-listening` status while active. Show the Hook error beside the composer without reusing the page-level save error; when unsupported, show a short fallback telling the user to use the phone keyboard microphone.

- [x] **Step 3: Add focused responsive styling**

Extend the existing composer rules with a neutral microphone appearance, the existing wine-red active treatment, a reduced-motion-safe listening indicator, and compact mobile sizing. Keep the send button visually primary and do not change unrelated assistant layout.

- [x] **Step 4: Run automated verification**

Run: `npm test && npm run typecheck && npm run build:vinext`

Expected: all tests PASS, type checking PASS, and the Cloudflare build completes.

- [x] **Step 5: Verify browser behavior**

Run `node scripts/assistant-voice-check.mjs` against the real component in Chrome with simulated recognition events. Verify start/stop, appended final text, manual edit/send, denied permission, service failure, overlength drafts, and cancellation during conversation/shortcut/dialog transitions. Check a mobile viewport and unsupported-browser fallback.

- [ ] Manual follow-up on a real device: grant microphone access and verify spoken Chinese recognition. Automation above validates interactions, not recognition quality or network availability.

- [x] **Step 6: Commit the assistant integration**

```bash
git add components/assistant.tsx app/globals.css
git commit -m "feat: add voice input to assistant"
```

- [x] **Step 7: Final branch check**

Run: `git status --short && git log -3 --oneline`

Expected: clean working tree with the design, speech boundary, and assistant integration commits present.

## Verification record

- Pure-helper tests first failed for the missing helper module, then passed (8 tests).
- Full suite: 94 tests passed; TypeScript check and Cloudflare build passed.
- `node scripts/assistant-voice-check.mjs` exercises the actual assistant component with a simulated browser recognition service: ordered final text, duplicate events, tail after stop, manual editing/sending, permission and silence errors, conversation/shortcut/dialog cancellation, unmount, overlength drafts, service errors, unsupported fallback, and a 375 px viewport. It does not use private account data or call an AI model.
- Real microphone authorization and recognition quality require a manual test on the user's browser; not validated by this automation.
- Sending is disabled while listening or waiting for the last result. Recognized text exceeding 12000 characters stays editable and must be shortened before sending.

Final review: fixed delayed speech crossing shortcut or dialog transitions. A regression first failed because recognition was not aborted; after cancellation was added, the full browser check passed. No deferred code findings.

2026-10-09 correction: use continuous recognition so the first utterance does not end dictation. The browser fixture now models single-result session termination and verifies listening stays active after one utterance, then appends the next exactly once. Real microphone/network behavior still requires device testing.
