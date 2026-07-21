import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertApprovedArchive,
  assertTargetProjectRef,
} from "./cutover-contract.mjs";

const PROTECTED_CUTOVER_DIRECTORY = resolve(
  "C:\\Users\\ahmed\\Documents\\Codex\\private\\klinikawfa\\cutover-20260722",
);

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
    const match = /^\s*\d+;\s+\d+\s+\d+\s+TABLE(?: DATA)?\s+(\S+)\s+(\S+)/.exec(line);
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

const assertProtectedOutputPath = (output) => {
  const resolvedOutput = resolve(output);
  if (
    resolvedOutput !== PROTECTED_CUTOVER_DIRECTORY &&
    !resolvedOutput.startsWith(`${PROTECTED_CUTOVER_DIRECTORY}\\`)
  ) {
    throw new Error("Inventory output must remain in the protected cutover directory");
  }
  return resolvedOutput;
};

export const createArchiveInventory = async ({ archive, output, projectRef }) => {
  assertTargetProjectRef(projectRef);
  const verifiedArchive = await assertApprovedArchive(archive);
  const archiveList = await listArchiveContents(verifiedArchive.path);
  const inventory = {
    ...parseArchiveList(archiveList),
    archiveSha256: verifiedArchive.sha256,
  };
  const outputPath = assertProtectedOutputPath(output);

  await mkdir(PROTECTED_CUTOVER_DIRECTORY, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  return inventory;
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
  console.log(`archive verified; schemas=${inventory.schemas.length}; tables=${inventory.tables.length}`);
  console.log(`archive sha256=${inventory.archiveSha256}`);
  console.log(`schemas=${inventory.schemas.join(",")}`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
