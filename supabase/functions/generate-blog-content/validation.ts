import { HttpError } from "../_shared/auth-helpers.ts";

export interface BlogContentRequest {
  topic: string;
  key_points: string[];
  category: string;
  tone: "empathetic" | "educational" | "motivational";
  target_audience: string;
}

const ALLOWED_TONES = new Set<BlogContentRequest["tone"]>([
  "empathetic",
  "educational",
  "motivational",
]);

function boundedString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `${label} is required`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new HttpError(400, `${label} is invalid`);
  }
  return normalized;
}

export function validateBlogContentRequest(value: unknown): BlogContentRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Invalid request");
  }

  const body = value as Record<string, unknown>;
  const topic = boundedString(body.topic, "Topic", 200);
  const category = boundedString(body.category, "Category", 100);
  const targetAudience = boundedString(body.target_audience, "Target audience", 100);

  if (!ALLOWED_TONES.has(body.tone as BlogContentRequest["tone"])) {
    throw new HttpError(400, "Tone is invalid");
  }

  if (!Array.isArray(body.key_points) || body.key_points.length < 1 || body.key_points.length > 10) {
    throw new HttpError(400, "Key points are invalid");
  }
  const keyPoints = body.key_points.map((point) => boundedString(point, "Key point", 300));

  return {
    topic,
    key_points: keyPoints,
    category,
    tone: body.tone as BlogContentRequest["tone"],
    target_audience: targetAudience,
  };
}
