import { describe, expect, it } from "vitest";
import {
  batchImageIds,
  selectRetryableImageIds,
} from "../../client/src/lib/post-images";

describe("calendar visual recovery", () => {
  it("selects pending and failed visuals while leaving ready or active generations untouched", () => {
    expect(
      selectRetryableImageIds([
        { id: "pending-1", imageStatus: "pending" },
        { id: "ready-1", imageStatus: "ready" },
        { id: "failed-1", imageStatus: "failed" },
        { id: "generating-1", imageStatus: "generating" },
        { id: "failed-2", imageStatus: "failed" },
      ])
    ).toEqual(["pending-1", "failed-1", "failed-2"]);
  });

  it("batches retry requests two at a time without dropping or duplicating posts", () => {
    const ids = ["post-1", "post-2", "post-3", "post-4", "post-5"];
    const batches = batchImageIds(ids);

    expect(batches).toEqual([
      ["post-1", "post-2"],
      ["post-3", "post-4"],
      ["post-5"],
    ]);
    expect(batches.flat()).toEqual(ids);
  });

  it("rejects invalid batch sizes instead of creating an infinite retry loop", () => {
    expect(() => batchImageIds(["post-1"], 0)).toThrow(
      "Image batch size must be a positive integer."
    );
  });
});
