import { expect, it } from "vitest";
import {
  mergeWorkspaceData,
  acceptSavedApplication,
} from "../lib/workspace-merge";
import type { Data, Application } from "../lib/types";
const app = { id: "a", version: 3, company: "测试公司" } as Application;
const current = {
  partial: false,
  applications: [app],
  events: [{ id: "old" }],
  resumes: [{ id: "resume" }],
  materials: [{ id: "material" }],
  interviews: [{ id: "interview" }],
  files: [{ id: "image" }],
  jobs: [{ id: "job" }],
} as Data;
it("merges a core refresh without erasing loaded supporting data", () => {
  const result = mergeWorkspaceData(current, {
    partial: true,
    applications: [],
    events: [],
    resumes: [],
    materials: [],
    interviews: [],
    files: [],
    jobs: [],
  } as unknown as Data);
  expect(result.applications).toEqual([]);
  expect(result.events).toEqual([]);
  expect(result.resumes).toEqual(current.resumes);
  expect(result.materials).toEqual(current.materials);
  expect(result.interviews).toEqual(current.interviews);
  expect(result.files).toEqual(current.files);
  expect(result.jobs).toEqual(current.jobs);
  expect(result.partial).toBe(false);
});
it("accepts a confirmed save immediately but rejects an older response", () => {
  const saved = { ...app, version: 4, stage: "AI面" };
  const next = acceptSavedApplication(current, saved);
  expect(next.applications).toEqual([saved]);
  expect(acceptSavedApplication(next, app)).toBe(next);
  expect(next.materials).toBe(current.materials);
});
it("updates application attachments from a narrow refresh without losing interview data", () => {
  const result = mergeWorkspaceData(current, {
    partial: true,
    scope: "applications",
    applications: [app],
    events: [],
    resumes: [],
    files: [{ id: "new-image" }],
  } as unknown as Data);
  expect(result.files).toEqual([{ id: "new-image" }]);
  expect(result.resumes).toEqual([]);
  expect(result.materials).toBe(current.materials);
  expect(result.interviews).toBe(current.interviews);
});
