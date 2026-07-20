import type { GeneratedPost } from "../../drizzle/schema";
import { generateImage } from "../_core/imageGeneration";

export const POST_IMAGE_MODEL = "MODEL_GPT_IMAGE_2";

export async function generatePostVisual(args: {
  post: GeneratedPost;
  editorGuidance?: string;
}) {
  const guidance = args.editorGuidance?.trim();
  const prompt = guidance
    ? `${args.post.imagePrompt}\n\nEDITOR REFINEMENT\n${guidance}\nApply this refinement while preserving photorealism, factual restraint, and the no-text/no-logo requirements.`
    : args.post.imagePrompt;

  const result = await generateImage({
    prompt,
    model: POST_IMAGE_MODEL,
    quality: "medium",
  });

  if (!result.url || !result.key) {
    throw new Error("The image service did not return persistent media metadata.");
  }

  return { url: result.url, key: result.key };
}
