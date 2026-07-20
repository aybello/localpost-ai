export type PostImageState = {
  id: string;
  imageStatus: "pending" | "generating" | "ready" | "failed";
};

export function selectRetryableImageIds(posts: readonly PostImageState[]): string[] {
  return posts
    .filter(post => post.imageStatus === "pending" || post.imageStatus === "failed")
    .map(post => post.id);
}

export function batchImageIds(postIds: readonly string[], batchSize = 2): string[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("Image batch size must be a positive integer.");
  }

  const batches: string[][] = [];
  for (let index = 0; index < postIds.length; index += batchSize) {
    batches.push(postIds.slice(index, index + batchSize));
  }
  return batches;
}
