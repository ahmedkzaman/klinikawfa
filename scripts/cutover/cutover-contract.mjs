import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export const LIVE_SOURCE_PROJECT_REF = "ncysmppzfjtiekfnomdv";
export const TARGET_PROJECT_REF = "nhjbqdiyptjqherdfbqk";
export const APPROVED_ARCHIVE_SHA256 =
  "16C5C80FB3695FF5E0E21D36AA2D8AAA5AA7CB32E8939DA6046E32A154C57863";
export const APPROVED_ARCHIVE_SIZE = 1_688_357;

export const assertTargetProjectRef = (value) => {
  if (value !== TARGET_PROJECT_REF) {
    throw new Error(
      `Refusing write-capable cutover operation for project ref ${value || "<missing>"}`,
    );
  }
  return value;
};

export const redactConnectionString = (value) => {
  const url = new URL(value);
  if (url.password) url.password = "***";
  if (url.searchParams.has("password")) url.searchParams.set("password", "***");
  return url.toString();
};

export const assertApprovedArchive = async (path) => {
  const metadata = await stat(path);
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const sha256 = hash.digest("hex").toUpperCase();
  if (metadata.size !== APPROVED_ARCHIVE_SIZE || sha256 !== APPROVED_ARCHIVE_SHA256) {
    throw new Error(
      `Approved archive fingerprint mismatch: size=${metadata.size} sha256=${sha256}`,
    );
  }
  return { path, size: metadata.size, sha256 };
};
