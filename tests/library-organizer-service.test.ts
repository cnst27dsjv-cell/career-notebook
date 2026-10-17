import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  lock: vi.fn(),
  transaction: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("../lib/db", () => ({
  db: { material: { findFirst: f.find }, $transaction: f.transaction },
}));
vi.mock("../lib/model", () => ({ generate: f.generate }));
import { handleLibraryOrganizer } from "../lib/library-organizer-service";

const candidate = (index: number) => ({
  type: "question",
  title: `问题 ${index}`,
  answer: "原始回答",
  quote: "原始回答",
});
const request = {
  action: "generate",
  id: "doc",
  version: 1,
  segment: "原始回答",
};
beforeEach(() => {
  vi.clearAllMocks();
  f.find.mockResolvedValue({
    id: "doc",
    userId: "u",
    version: 1,
    format: "document",
    content: "原始回答",
    structure: {},
    title: "面试记录",
  });
  f.lock.mockResolvedValue({ count: 1 });
  f.update.mockImplementation(async ({ data }) => data);
  f.transaction.mockImplementation(async (run) =>
    run({ material: { updateMany: f.lock, update: f.update } }),
  );
});
it.each([21, 80])(
  "preserves all %i valid AI candidates instead of rejecting or truncating at 20",
  async (count) => {
    f.generate.mockResolvedValue({
      items: Array.from({ length: count }, (_, i) => candidate(i)),
    });
    const result = await handleLibraryOrganizer("u", request);
    expect(result.structure.items).toHaveLength(count);
    expect(result.structure.items.at(-1).title).toBe(`问题 ${count - 1}`);
    expect(new Set(result.structure.items.map((i: any) => i.key)).size).toBe(
      count,
    );
    expect(
      result.structure.items.every((i: any) => i.selected && !i.savedId),
    ).toBe(true);
  },
);
it("explains excessive results in Chinese without saving partial results", async () => {
  f.generate.mockResolvedValue({
    items: Array.from({ length: 81 }, (_, i) => candidate(i)),
  });
  await expect(handleLibraryOrganizer("u", request)).rejects.toThrow(
    /超过.*80.*缩短/,
  );
  expect(f.transaction).not.toHaveBeenCalled();
});
it("counts already saved candidates toward capacity and preserves them on overflow", async () => {
  const old = await f.find();
  old.structure = {
    items: Array.from({ length: 75 }, (_, i) => ({
      ...candidate(i),
      key: `old-${i}`,
      savedId: `saved-${i}`,
    })),
  };
  f.find.mockResolvedValue(old);
  f.generate.mockResolvedValue({
    items: Array.from({ length: 6 }, (_, i) => candidate(i)),
  });
  await expect(handleLibraryOrganizer("u", request)).rejects.toThrow(
    /还可.*5.*6/,
  );
  expect(f.transaction).not.toHaveBeenCalled();
  expect(old.structure.items).toHaveLength(75);
});
it("does not call the model if the document is already full", async () => {
  const old = await f.find();
  old.structure = {
    items: Array.from({ length: 80 }, (_, i) => ({
      ...candidate(i),
      key: `old-${i}`,
      savedId: `saved-${i}`,
    })),
  };
  f.find.mockResolvedValue(old);
  await expect(handleLibraryOrganizer("u", request)).rejects.toThrow(
    /80.*新文档/,
  );
  expect(f.generate).not.toHaveBeenCalled();
});
it("gives actionable feedback for malformed model fields and still checks source evidence", async () => {
  f.generate.mockResolvedValue({
    items: [{ ...candidate(0), type: "invalid" }],
  });
  await expect(handleLibraryOrganizer("u", request)).rejects.toThrow(
    /AI.*格式.*重试/,
  );
  f.generate.mockResolvedValue({
    items: [{ ...candidate(0), quote: "不存在的引用" }],
  });
  await expect(handleLibraryOrganizer("u", request)).rejects.toThrow(/原文/);
  expect(f.transaction).not.toHaveBeenCalled();
});
