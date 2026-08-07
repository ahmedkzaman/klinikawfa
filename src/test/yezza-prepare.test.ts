import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { prepareYezzaImport } from "../../supabase/functions/yezza-import/import-core";
import {
  prepareYezzaBatchFiles,
  runPreparedYezzaImport,
  type PreparedManifest,
  type YezzaResolutionFile,
} from "../../scripts/yezza-import/prepare";

const doctorId = "78000000-0000-4000-8000-000000000001";

async function writeFixture(root: string, patientCount = 3): Promise<{ inputDirectory: string; decisionsPath: string }> {
  const inputDirectory = join(root, "input");
  await mkdir(inputDirectory);
  const patientRows = Array.from({ length: patientCount }, (_, index) =>
    `source-${index + 1},Patient ${index + 1},${index === 0 ? "900101-14-5678" : ""},0123456789,1990-01-01`
  );
  await Promise.all([
    writeFile(join(inputDirectory, "patients.csv"), `PatientID,Patient Name,IC/Passport,Phone,DOB\n${patientRows.join("\n")}\n`, "utf8"),
    writeFile(join(inputDirectory, "consultations.csv"), "Visit ID,PatientID,Visit Date,Visit Note,Diagnosis,Attending Dr,Service Name\nvisit-1,source-1,2025-01-02T03:04:05.000Z,Historical note,Tension headache,Dr Roster,Consultation : 35.00\n", "utf8"),
    writeFile(join(inputDirectory, "transactions_1.csv"), "Visit ID,PatientID,Bill#,Total (RM),Paid Amount (RM),Payment Method,Payment Channel,Status\nvisit-1,source-1,bill-1,35.00,35.00,CASH,Clinic,Paid\n", "utf8"),
    writeFile(join(inputDirectory, "transactions_2.csv"), "Visit ID,PatientID,Bill#,Total (RM),Paid Amount (RM),Payment Method,Payment Channel,Status\nvisit-1,source-1,bill-1,35.00,35.00,CASH,Clinic,Paid\n", "utf8"),
  ]);
  const decisions: YezzaResolutionFile = {
    version: 1,
    sourceBatchId: "fixture-2026-08-06",
    patients: Object.fromEntries(Array.from({ length: patientCount }, (_, index) => [
      `patients.csv:${index + 2}`,
      { action: "create", reviewed: true },
    ])),
    doctors: {
      "dr roster": { action: "assign", doctorId, reviewed: true },
    },
  };
  const decisionsPath = join(root, "resolutions.json");
  await writeFile(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`, "utf8");
  return { inputDirectory, decisionsPath };
}

async function directoryContents(directory: string): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all((await readdir(directory)).sort().map(async (filename) => [
    filename,
    await readFile(join(directory, filename), "utf8"),
  ])));
}

describe("deterministic Yezza preparation", () => {
  it("caps visit batches at 250 visits so guarded database transactions stay bounded", async () => {
    const root = await mkdtemp(join(tmpdir(), "yezza-visit-batches-"));
    try {
      const { inputDirectory, decisionsPath } = await writeFixture(root, 1);
      const visitRows = Array.from({ length: 251 }, (_, index) =>
        `visit-${index + 1},source-1,2025-01-02T03:04:05.000Z,Historical note,Tension headache,Dr Roster,Consultation : 35.00`
      );
      await writeFile(
        join(inputDirectory, "consultations.csv"),
        `Visit ID,PatientID,Visit Date,Visit Note,Diagnosis,Attending Dr,Service Name\n${visitRows.join("\n")}\n`,
        "utf8",
      );

      const manifest = await prepareYezzaBatchFiles({
        inputDirectory,
        decisionsPath,
        outputDirectory: join(root, "output"),
        allowNonProductionReconciliation: true,
      });
      const visitBatches = manifest.batches.filter((batch) => batch.phase === "visits");

      expect(visitBatches).toHaveLength(2);
      expect(Math.max(...visitBatches.map((batch) => batch.counts.visits))).toBeLessThanOrEqual(250);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("streams four CSVs into byte-stable payloads whose arrays never exceed 2,000 rows", async () => {
    const root = await mkdtemp(join(tmpdir(), "yezza-prepare-"));
    try {
      const { inputDirectory, decisionsPath } = await writeFixture(root, 2_001);
      const firstOutput = join(root, "first");
      const secondOutput = join(root, "second");

      const first = await prepareYezzaBatchFiles({ inputDirectory, decisionsPath, outputDirectory: firstOutput, allowNonProductionReconciliation: true });
      const second = await prepareYezzaBatchFiles({ inputDirectory, decisionsPath, outputDirectory: secondOutput, allowNonProductionReconciliation: true });

      expect(await directoryContents(firstOutput)).toEqual(await directoryContents(secondOutput));
      expect(first).toEqual(second);
      expect(first).toMatchObject({
        formatVersion: 1,
        sourceBatchId: "fixture-2026-08-06",
        reconciliation: {
          inputRows: 2,
          duplicateRowsRemoved: 1,
          uniqueBills: 1,
          sourceTotal: 35,
          paidTotal: 35,
          matchesExpectedBaseline: false,
        },
      });
      expect(first.batches).toHaveLength(3);
      expect(first.manifestHash).toMatch(/^[a-f0-9]{64}$/);
      expect(first.resolutionHash).toMatch(/^[a-f0-9]{64}$/);
      expect(first.artifactHash).toMatch(/^[a-f0-9]{64}$/);
      for (const batch of first.batches) {
        const payload = JSON.parse(await readFile(join(firstOutput, batch.filename), "utf8")) as { patients: unknown[]; visits: Array<{ items: unknown[]; transactions: unknown[] }> };
        expect(payload.patients.length).toBeLessThanOrEqual(2_000);
        expect(payload.visits.length).toBeLessThanOrEqual(2_000);
        expect(payload.visits.every((visit) => visit.items.length <= 2_000 && visit.transactions.length <= 2_000)).toBe(true);
        expect((await prepareYezzaImport(payload)).payloadHash).toBe(batch.payloadHash);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate source identifiers until every affected row has explicit duplicate review confirmation", async () => {
    const root = await mkdtemp(join(tmpdir(), "yezza-prepare-duplicate-"));
    try {
      const { inputDirectory, decisionsPath } = await writeFixture(root, 2);
      await writeFile(join(inputDirectory, "patients.csv"), "PatientID,Patient Name,IC/Passport\nsource-1,Alpha Person,820101-14-1111\nsource-2,Beta Person,820101141111\n", "utf8");

      await expect(prepareYezzaBatchFiles({
        inputDirectory,
        decisionsPath,
        outputDirectory: join(root, "blocked"),
        allowNonProductionReconciliation: true,
      })).rejects.toThrow("patients.csv:2 must confirm duplicate source identifier review");

      const decisions = JSON.parse(await readFile(decisionsPath, "utf8")) as YezzaResolutionFile;
      decisions.patients["patients.csv:2"].confirmedDuplicateIdentifier = true;
      decisions.patients["patients.csv:3"].confirmedDuplicateIdentifier = true;
      await writeFile(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`, "utf8");
      const manifest = await prepareYezzaBatchFiles({
        inputDirectory,
        decisionsPath,
        outputDirectory: join(root, "prepared"),
        allowNonProductionReconciliation: true,
      });

      expect(manifest.reviewCounts.patientReview).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("dry-runs before approval and reuses byte-identical approved payloads for apply and retry", async () => {
    const root = await mkdtemp(join(tmpdir(), "yezza-run-prepared-"));
    try {
      const { inputDirectory, decisionsPath } = await writeFixture(root);
      const outputDirectory = join(root, "prepared");
      const manifest = await prepareYezzaBatchFiles({ inputDirectory, decisionsPath, outputDirectory, allowNonProductionReconciliation: true });
      const calls: Array<{ action: string; body: Record<string, unknown> }> = [];
      const batchesBySourceId = new Map(manifest.batches.map((batch) => [batch.sourceBatchId, batch]));
      const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const action = new URL(String(input)).searchParams.get("action") ?? "";
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push({ action, body });
        const payload = (body.payload ?? body) as { sourceBatchId: string; manifestHash: string; resolutionHash: string };
        const batch = batchesBySourceId.get(payload.sourceBatchId)!;
        if (action === "dry-run") return Response.json({ payloadHash: batch.payloadHash, manifestHash: manifest.manifestHash, resolutionHash: manifest.resolutionHash });
        if (action === "approve") return Response.json({ importBatchId: `78000000-0000-4000-8000-${String(batch.index).padStart(12, "0")}`, status: "approved", payloadHash: batch.payloadHash });
        return Response.json({ status: "completed", idempotent: action === "apply" && calls.filter((call) => call.action === "apply").length > manifest.batches.length });
      };

      await runPreparedYezzaImport({ mode: "approve", manifestPath: join(outputDirectory, "manifest.json"), endpoint: "https://example.invalid/yezza-import", accessToken: "test-token", fetchImpl });
      await runPreparedYezzaImport({ mode: "apply", manifestPath: join(outputDirectory, "manifest.json"), endpoint: "https://example.invalid/yezza-import", accessToken: "test-token", fetchImpl });
      const firstApplyBodies = calls.filter((call) => call.action === "apply").map((call) => JSON.stringify(call.body));
      await runPreparedYezzaImport({ mode: "retry", manifestPath: join(outputDirectory, "manifest.json"), endpoint: "https://example.invalid/yezza-import", accessToken: "test-token", fetchImpl });
      const retryBodies = calls.filter((call) => call.action === "apply").slice(manifest.batches.length).map((call) => JSON.stringify(call.body));

      expect(calls.slice(0, manifest.batches.length * 2).map((call) => call.action)).toEqual(
        manifest.batches.flatMap(() => ["dry-run", "approve"]),
      );
      expect(retryBodies).toEqual(firstApplyBodies);
      const state = JSON.parse(await readFile(join(outputDirectory, "import-state.json"), "utf8")) as { manifestHash: string; approvals: unknown[] };
      expect(state.manifestHash).toBe((manifest as PreparedManifest).manifestHash);
      expect(state.approvals).toHaveLength(manifest.batches.length);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("retries a truncated successful response because guarded import operations are idempotent", async () => {
    const root = await mkdtemp(join(tmpdir(), "yezza-run-retry-"));
    try {
      const { inputDirectory, decisionsPath } = await writeFixture(root, 1);
      const outputDirectory = join(root, "prepared");
      const manifest = await prepareYezzaBatchFiles({ inputDirectory, decisionsPath, outputDirectory, allowNonProductionReconciliation: true });
      let calls = 0;
      const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        calls += 1;
        if (calls === 1) return new Response("{", { status: 200 });
        const body = JSON.parse(String(init?.body)) as { sourceBatchId: string };
        const batch = manifest.batches.find((candidate) => candidate.sourceBatchId === body.sourceBatchId)!;
        return Response.json({ payloadHash: batch.payloadHash, manifestHash: manifest.manifestHash, resolutionHash: manifest.resolutionHash });
      };

      await expect(runPreparedYezzaImport({
        mode: "dry-run",
        manifestPath: join(outputDirectory, "manifest.json"),
        endpoint: "https://example.invalid/yezza-import",
        accessToken: "test-token",
        fetchImpl,
      })).resolves.toBeUndefined();
      expect(calls).toBe(manifest.batches.length + 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("can resume from a selected prepared batch without replaying earlier batches", async () => {
    const root = await mkdtemp(join(tmpdir(), "yezza-run-range-"));
    try {
      const { inputDirectory, decisionsPath } = await writeFixture(root, 501);
      const outputDirectory = join(root, "prepared");
      const manifest = await prepareYezzaBatchFiles({ inputDirectory, decisionsPath, outputDirectory, allowNonProductionReconciliation: true });
      const selected = manifest.batches.at(-1)!;
      const sourceBatchIds: string[] = [];
      const fetchImpl = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const payload = JSON.parse(String(init?.body)) as { sourceBatchId: string };
        sourceBatchIds.push(payload.sourceBatchId);
        return Response.json({ payloadHash: selected.payloadHash, manifestHash: manifest.manifestHash, resolutionHash: manifest.resolutionHash });
      };
      await runPreparedYezzaImport({ mode: "dry-run", manifestPath: join(outputDirectory, "manifest.json"), endpoint: "https://example.invalid/yezza-import", accessToken: "test-token", startIndex: selected.index, fetchImpl });
      expect(sourceBatchIds).toEqual([selected.sourceBatchId]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
