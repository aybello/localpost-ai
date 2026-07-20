export type CalendarViewState =
  | "businesses-loading"
  | "businesses-error"
  | "businesses-empty"
  | "brand-required"
  | "posts-loading"
  | "posts-error"
  | "posts-empty"
  | "ready";

export type CalendarViewStateInput = {
  businessesLoading: boolean;
  businessesError: boolean;
  businessCount: number;
  hasBrandProfile: boolean;
  postsLoading: boolean;
  postsError: boolean;
  postCount: number;
};

export function getCalendarViewState(input: CalendarViewStateInput): CalendarViewState {
  if (input.businessesLoading) return "businesses-loading";
  if (input.businessesError) return "businesses-error";
  if (input.businessCount === 0) return "businesses-empty";
  if (!input.hasBrandProfile) return "brand-required";
  if (input.postsLoading) return "posts-loading";
  if (input.postsError) return "posts-error";
  if (input.postCount === 0) return "posts-empty";
  return "ready";
}
