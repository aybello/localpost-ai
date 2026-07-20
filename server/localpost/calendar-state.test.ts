import { describe, expect, it } from "vitest";
import { getCalendarViewState } from "../../client/src/lib/calendar-state";

const readyBase = {
  businessesLoading: false,
  businessesError: false,
  businessCount: 1,
  hasBrandProfile: true,
  postsLoading: false,
  postsError: false,
  postCount: 1,
};

describe("calendar view-state resolution", () => {
  it.each([
    [{ ...readyBase, businessesLoading: true }, "businesses-loading"],
    [{ ...readyBase, businessesError: true }, "businesses-error"],
    [{ ...readyBase, businessCount: 0 }, "businesses-empty"],
    [{ ...readyBase, hasBrandProfile: false }, "brand-required"],
    [{ ...readyBase, postsLoading: true }, "posts-loading"],
    [{ ...readyBase, postsError: true }, "posts-error"],
    [{ ...readyBase, postCount: 0 }, "posts-empty"],
    [readyBase, "ready"],
  ] as const)("maps %o to %s", (input, expected) => {
    expect(getCalendarViewState(input)).toBe(expected);
  });

  it("prioritizes workspace failures over downstream post state", () => {
    expect(
      getCalendarViewState({
        ...readyBase,
        businessesError: true,
        postsLoading: true,
        postsError: true,
        postCount: 0,
      })
    ).toBe("businesses-error");
  });
});
