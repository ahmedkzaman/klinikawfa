import { execFile } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { basename, delimiter, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertApprovedArchive,
  assertTargetProjectRef,
} from "./cutover-contract.mjs";

const PROTECTED_CUTOVER_DIRECTORY = resolve(
  "C:\\Users\\ahmed\\Documents\\Codex\\private\\klinikawfa\\cutover-20260722",
);

const comparePath = (value) => resolve(value).replace(/[\\/]+$/, "").toLocaleLowerCase("en-US");

const isWithin = (child, parent) => {
  const normalizedChild = comparePath(child);
  const normalizedParent = comparePath(parent);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}\\`);
};

const assertNotReparsePoint = async (path, label) => {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink()) {
    throw new Error(`Refusing ${label} through a symlink, junction, or reparse point`);
  }
  return metadata;
};

const canonicalProtectedRoot = async (protectedDirectory) => {
  await mkdir(protectedDirectory, { recursive: true });
  await assertNotReparsePoint(protectedDirectory, "protected cutover directory");
  const canonicalRoot = await realpath(protectedDirectory);
  if (comparePath(canonicalRoot) !== comparePath(protectedDirectory)) {
    throw new Error("Refusing protected cutover directory through a symlink, junction, or reparse point");
  }
  return canonicalRoot;
};

const createCanonicalOutputParent = async (output, protectedRoot) => {
  const requestedOutput = resolve(output);
  if (!isWithin(requestedOutput, protectedRoot) || comparePath(requestedOutput) === comparePath(protectedRoot)) {
    throw new Error("Inventory output must remain in the protected cutover directory");
  }

  const requestedRelative = relative(protectedRoot, requestedOutput);
  const segments = requestedRelative.split(/[\\/]+/);
  const fileName = segments.pop();
  if (!fileName || fileName !== basename(requestedOutput) || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Inventory output must remain in the protected cutover directory");
  }

  let parent = protectedRoot;
  for (const segment of segments) {
    parent = join(parent, segment);
    await mkdir(parent, { recursive: true });
    await assertNotReparsePoint(parent, "inventory output");
    const canonicalParent = await realpath(parent);
    if (!isWithin(canonicalParent, protectedRoot)) {
      throw new Error("Inventory output must remain in the protected cutover directory");
    }
    parent = canonicalParent;
  }

  const canonicalParent = await realpath(parent);
  if (!isWithin(canonicalParent, protectedRoot)) {
    throw new Error("Inventory output must remain in the protected cutover directory");
  }
  return { path: join(canonicalParent, fileName), parent: canonicalParent };
};

export const resolveProtectedOutputPath = async (
  output,
  protectedDirectory = PROTECTED_CUTOVER_DIRECTORY,
) => {
  const protectedRoot = await canonicalProtectedRoot(protectedDirectory);
  const resolved = await createCanonicalOutputParent(output, protectedRoot);

  try {
    await assertNotReparsePoint(resolved.path, "inventory output");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return resolved.path;
};

const listArchiveContents = (archive) =>
  new Promise((resolveList, reject) => {
    execFile("pg_restore", ["--list", archive], (error, stdout) => {
      if (error) reject(error);
      else resolveList(stdout);
    });
  });

export const parseArchiveList = (contents) => {
  const tables = new Map();

  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*\d+;\s+\d+\s+\d+\s+TABLE(?: DATA)?(?!\s+ATTACH\b)\s+(\S+)\s+(\S+)/.exec(line);
    if (!match) continue;

    const [, schema, table] = match;
    tables.set(`${schema}${delimiter}${table}`, { schema, table });
  }

  const tableList = [...tables.values()].sort(
    (left, right) =>
      left.schema.localeCompare(right.schema) || left.table.localeCompare(right.table),
  );
  const schemas = [...new Set(tableList.map(({ schema }) => schema))];

  return { schemas, tables: tableList };
};

export const stageApprovedArchive = async ({
  archive,
  protectedDirectory = PROTECTED_CUTOVER_DIRECTORY,
  verifyArchive = assertApprovedArchive,
  copyArchive = copyFile,
}) => {
  const protectedRoot = await canonicalProtectedRoot(protectedDirectory);
  const verifiedSource = await verifyArchive(archive);
  const stagingDirectory = await mkdtemp(join(protectedRoot, ".archive-stage-"));
  const stagedPath = join(stagingDirectory, "source.backup");

  try {
    await assertNotReparsePoint(stagingDirectory, "archive staging directory");
    await copyArchive(verifiedSource.path, stagedPath);
    const verifiedStaged = await verifyArchive(stagedPath);
    return {
      ...verifiedStaged,
      path: stagedPath,
      cleanup: () => rm(stagingDirectory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
};

const writeInventorySafely = async (outputPath, inventory) => {
  try {
    await assertNotReparsePoint(outputPath, "inventory output");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    const handle = await open(temporaryPath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(inventory, null, 2)}\n`, "utf8");
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
};

const parseArguments = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if ((flag !== "--archive" && flag !== "--output") || !value) {
      throw new Error("Usage: archive-inventory.mjs --archive <path> --output <path>");
    }
    options[flag.slice(2)] = value;
  }
  return options;
};

export const createArchiveInventory = async ({ archive, output, projectRef }) => {
  assertTargetProjectRef(projectRef);
  const outputPath = await resolveProtectedOutputPath(output);
  const stagedArchive = await stageApprovedArchive({ archive });

  try {
    const archiveList = await listArchiveContents(stagedArchive.path);
    const inventory = {
      ...parseArchiveList(archiveList),
      archiveSha256: stagedArchive.sha256,
    };
    await writeInventorySafely(outputPath, inventory);
    return inventory;
  } finally {
    await stagedArchive.cleanup();
  }
};

const main = async () => {
  const { archive = process.env.KLINIK_AWFA_SOURCE_ARCHIVE, output } = parseArguments(
    process.argv.slice(2),
  );
  if (!archive || !output) {
    throw new Error("Usage: archive-inventory.mjs --archive <path> --output <path>");
  }

  const inventory = await createArchiveInventory({
    archive,
    output,
    projectRef: process.env.SUPABASE_PROJECT_REF,
  });
  const applicationTableCount = inventory.tables.filter(({ schema }) => schema === "public").length;
  console.log(`archive verified; schemas=${inventory.schemas.length}; tables=${applicationTableCount}`);
  console.log(`archive sha256=${inventory.archiveSha256}`);
  console.log(`schemas=${inventory.schemas.join(",")}`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
