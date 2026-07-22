import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APPROVED_ARCHIVE_SHA256,
  LIVE_SOURCE_PROJECT_REF,
  TARGET_PROJECT_REF,
  assertTargetProjectRef,
  assertApprovedArchive,
  redactConnectionString,
} from "../../scripts/cutover/cutover-contract.mjs";
import {
  parseArchiveList,
  resolveProtectedOutputPath,
  stageApprovedArchive,
} from "../../scripts/cutover/archive-inventory.mjs";

describe("production cutover contract", () => {
  it("locks the approved source and target", () => {
    expect(APPROVED_ARCHIVE_SHA256).toBe(
      "16C5C80FB3695FF5E0E21D36AA2D8AAA5AA7CB32E8939DA6046E32A154C57863",
    );
    expect(LIVE_SOURCE_PROJECT_REF).toBe("ncysmppzfjtiekfnomdv");
    expect(TARGET_PROJECT_REF).toBe("nhjbqdiyptjqherdfbqk");
  });

  it("rejects every write target except the promoted project", () => {
    expect(assertTargetProjectRef(TARGET_PROJECT_REF)).toBe(TARGET_PROJECT_REF);
    expect(() => assertTargetProjectRef(LIVE_SOURCE_PROJECT_REF)).toThrow(
      /Refusing write-capable cutover operation/,
    );
  });

  it("redacts passwords and query credentials", () => {
    const input = "postgresql://postgres:secret@example.test:5432/postgres?password=secret";
    const output = redactConnectionString(input);
    expect(output).not.toContain("secret");
    expect(output).toContain("postgresql://postgres:***@example.test:5432/postgres");
  });

  it("rejects an archive with a mismatched fingerprint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cutover-contract-"));
    const archive = join(directory, "unapproved.backup");
    await writeFile(archive, "unapproved archive");

    await expect(assertApprovedArchive(archive)).rejects.toThrow(
      /Approved archive fingerprint mismatch/,
    );
    await rm(directory, { recursive: true, force: true });
  });
});

describe("archive inventory", () => {
  it("lists schema-qualified tables without any record data", () => {
    const inventory = parseArchiveList(`
; Archive created at 2026-07-21 12:00:00 UTC
101; 1259 20001 TABLE public patients postgres
102; 0 20001 TABLE DATA public patients postgres
103; 1259 20002 TABLE clinic appointments postgres
`);

    expect(inventory.schemas).toEqual(["clinic", "public"]);
    expect(inventory.tables).toEqual([
      { schema: "clinic", table: "appointments" },
      { schema: "public", table: "patients" },
    ]);
  });

  it("excludes descriptors while retaining managed-schema table metadata", () => {
    const inventory = parseArchiveList(`
201; 1259 30001 TABLE public patients postgres
202; 0 30001 TABLE DATA public patients postgres
203; 1259 30002 TABLE auth users supabase_auth_admin
204; 1259 30003 TABLE realtime messages supabase_realtime_admin
205; 0 0 TABLE ATTACH realtime messages_2026_07_22 supabase_realtime_admin
206; 0 0 ACL - SCHEMA public postgres
207; 0 0 COMMENT - EXTENSION pgcrypto
`);

    expect(inventory.schemas).toEqual(["auth", "public", "realtime"]);
    expect(inventory.tables).toEqual([
      { schema: "auth", table: "users" },
      { schema: "public", table: "patients" },
      { schema: "realtime", table: "messages" },
    ]);
  });

  it("enforces a canonical protected output path, including Windows casing", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutover-output-"));
    const output = join(root, "inventory", "source.json");
    const outside = join(tmpdir(), "outside.json");

    const caseVariantRoot = process.platform === "win32" ? root.toUpperCase() : root;
    await expect(resolveProtectedOutputPath(output, caseVariantRoot)).resolves.toBe(output);
    await expect(resolveProtectedOutputPath(outside, root)).rejects.toThrow(
      /protected cutover directory/,
    );
    await rm(root, { recursive: true, force: true });
  });

  it("rejects protected output paths that traverse a junction", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutover-output-"));
    const outside = await mkdtemp(join(tmpdir(), "cutover-outside-"));
    const junction = join(root, "escape");
    await symlink(outside, junction, "junction");

    await expect(resolveProtectedOutputPath(join(junction, "source.json"), root)).rejects.toThrow(
      /reparse point|protected cutover directory/,
    );
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it("rejects a pre-existing symlinked inventory file", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutover-output-"));
    const outside = await mkdtemp(join(tmpdir(), "cutover-outside-"));
    const output = join(root, "source.json");
    await symlink(outside, output, "junction");

    await expect(resolveProtectedOutputPath(output, root)).rejects.toThrow(
      /reparse point|protected cutover directory/,
    );
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it("verifies the protected staged copy after a source swap", async () => {
    const root = await mkdtemp(join(tmpdir(), "cutover-stage-"));
    const source = join(root, "source.backup");
    await writeFile(source, "approved-before-copy");
    const verifyCalls: string[] = [];
    const verifyArchive = async (path: string) => {
      verifyCalls.push(path);
      return { path, size: (await readFile(path)).length, sha256: "TEST" };
    };
    const copyArchive = async (from: string, to: string) => {
      await writeFile(to, await readFile(from));
      await writeFile(from, "swapped-after-copy");
    };

    const staged = await stageApprovedArchive({
      archive: source,
      protectedDirectory: root,
      verifyArchive,
      copyArchive,
    });

    expect(await readFile(staged.path, "utf8")).toBe("approved-before-copy");
    expect(verifyCalls).toEqual([source, staged.path]);
    await staged.cleanup();
    await rm(root, { recursive: true, force: true });
  });
});
