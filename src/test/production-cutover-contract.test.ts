import { describe, expect, it } from "vitest";
import {
  APPROVED_ARCHIVE_SHA256,
  LIVE_SOURCE_PROJECT_REF,
  TARGET_PROJECT_REF,
  assertTargetProjectRef,
  redactConnectionString,
} from "../../scripts/cutover/cutover-contract.mjs";
import { parseArchiveList } from "../../scripts/cutover/archive-inventory.mjs";

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
});
