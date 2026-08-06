import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { matchYezzaPatient, normalizeName } from "./matchPatients.ts";
import type { ExistingPatient, YezzaPatient } from "./types.ts";

type CsvRow = Record<string, string>;

type DryRunOptions = {
  inputDirectory: string;
  outputDirectory: string;
};

const requiredFiles = ["patients.csv", "consultations.csv", "transactions_1.csv", "transactions_2.csv"];

function commandOptions(argumentsList: string[]): DryRunOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Usage: npm run yezza:dry-run -- --input-dir <local-csv-directory> [--output-dir <sanitized-report-directory>]");
    }
    values.set(key, value);
  }

  const inputDirectory = values.get("--input-dir") ?? process.env.YEZZA_INPUT_DIR;
  if (!inputDirectory) {
    throw new Error("A local CSV directory is required. Set YEZZA_INPUT_DIR or pass --input-dir.");
  }
  return {
    inputDirectory: resolve(inputDirectory),
    outputDirectory: resolve(values.get("--output-dir") ?? "yezza-dry-run-report"),
  };
}

function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.length > 0)) rows.push(row);

  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((cells) => Object.fromEntries(header.map((column, index) => [column.replace(/^\uFEFF/, "").trim(), cells[index] ?? ""])));
}

async function readCsv(inputDirectory: string, filename: string): Promise<CsvRow[]> {
  return parseCsv(await readFile(join(inputDirectory, filename), "utf8"));
}

function headerKey(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
}

function valueFor(row: CsvRow, names: string[]): string {
  const fields = new Map(Object.entries(row).map(([key, value]) => [headerKey(key), value.trim()]));
  for (const name of names) {
    const value = fields.get(headerKey(name));
    if (value) return value;
  }
  return "";
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function sourcePatient(row: CsvRow): YezzaPatient {
  return {
    sourcePatientId: valueFor(row, ["PatientID", "Patient ID", "Patient Id", "ID"]),
    name: valueFor(row, ["Patient Name", "Name"]),
    nationalId: nullable(valueFor(row, ["IC/Passport", "IC Passport", "IC", "NRIC", "National ID"])),
    phone: nullable(valueFor(row, ["Phone", "Phone No", "Mobile", "Contact No"])),
    dateOfBirth: nullable(valueFor(row, ["DOB", "Date Of Birth", "Birth Date"])),
    address: nullable(valueFor(row, ["Address", "Home Address"])),
  };
}

function fingerprint(reportReferenceKey: Uint8Array, type: string, value: string): string {
  return `${type}-${createHmac("sha256", reportReferenceKey).update(`${type}:${value}`).digest("hex").slice(0, 16)}`;
}

function csvCell(value: string | number): string {
  const raw = String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

async function writeCsv(outputDirectory: string, filename: string, columns: string[], rows: Array<Record<string, string | number>>): Promise<void> {
  const content = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column] ?? "")).join(","))].join("\n") + "\n";
  await writeFile(join(outputDirectory, filename), content, "utf8");
}

async function currentClinicRoster(): Promise<{ patients: ExistingPatient[]; doctorNames: Set<string>; configured: boolean }> {
  const url = process.env.YEZZA_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.YEZZA_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { patients: [], doctorNames: new Set(), configured: false };

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const patients: ExistingPatient[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("patients")
      .select("id,name,national_id,passport_no,phone,date_of_birth,address")
      .range(from, from + 999);
    if (error) throw new Error(`Unable to read Klinik Awfa patients: ${error.message}`);
    patients.push(...(data ?? []).map((patient) => ({
      id: patient.id,
      name: patient.name ?? "",
      nationalId: patient.national_id,
      passportNo: patient.passport_no,
      phone: patient.phone,
      dateOfBirth: patient.date_of_birth,
      address: patient.address,
    })));
    if ((data?.length ?? 0) < 1000) break;
  }

  const doctors: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("doctors").select("name").range(from, from + 999);
    if (error) throw new Error(`Unable to read Klinik Awfa doctors: ${error.message}`);
    doctors.push(...(data ?? []).map((doctor) => doctor.name ?? ""));
    if ((data?.length ?? 0) < 1000) break;
  }

  return {
    patients,
    doctorNames: new Set(doctors.map(normalizeName).filter(Boolean)),
    configured: true,
  };
}

function transactionKey(row: CsvRow): string {
  return [
    valueFor(row, ["Visit ID", "VisitID"]),
    valueFor(row, ["Bill#", "Bill #", "Bill No", "Bill Number"]),
    valueFor(row, ["Total", "Total (RM)"]),
    valueFor(row, ["Paid Amount", "Paid Amount (RM)"]),
    valueFor(row, ["Method", "Payment Method"]),
    valueFor(row, ["Channel"]),
  ].join("\u001f");
}

async function runDryRun(options: DryRunOptions): Promise<void> {
  await Promise.all(requiredFiles.map(async (filename) => readFile(join(options.inputDirectory, filename), "utf8")));
  const [patientRows, consultationRows, transactionRowsOne, transactionRowsTwo, roster] = await Promise.all([
    readCsv(options.inputDirectory, "patients.csv"),
    readCsv(options.inputDirectory, "consultations.csv"),
    readCsv(options.inputDirectory, "transactions_1.csv"),
    readCsv(options.inputDirectory, "transactions_2.csv"),
    currentClinicRoster(),
  ]);
  const reportReferenceKey = randomBytes(32);
  const reportReference = (type: string, value: string) => fingerprint(reportReferenceKey, type, value);

  const matchRows: Array<Record<string, string>> = [];
  const reviewRows: Array<Record<string, string>> = [];
  const decisionCounts = { "exact-id": 0, "phone-name-dob": 0, review: 0, new: 0 };
  for (const row of patientRows) {
    const patient = sourcePatient(row);
    const decision = matchYezzaPatient(patient, roster.patients);
    decisionCounts[decision.kind] += 1;
    const sanitized = {
      source_patient_ref: reportReference("source-patient", patient.sourcePatientId || JSON.stringify(row)),
      existing_patient_ref: decision.existingPatientId ? reportReference("existing-patient", decision.existingPatientId) : "",
      match_kind: decision.kind,
      reason: decision.reason,
      conflict_fields: decision.conflicts.join(";"),
    };
    if (decision.kind === "review") reviewRows.push(sanitized);
    else matchRows.push(sanitized);
  }

  const consultationsByVisit = new Set(consultationRows.map((row) => valueFor(row, ["Visit ID", "VisitID"])).filter(Boolean));
  const doctorCounts = new Map<string, number>();
  for (const row of consultationRows) {
    const doctor = valueFor(row, ["Attending Dr", "Attending Doctor", "Doctor", "Dr"]);
    if (doctor && !roster.doctorNames.has(normalizeName(doctor))) {
      const key = reportReference("source-doctor", doctor);
      doctorCounts.set(key, (doctorCounts.get(key) ?? 0) + 1);
    }
  }

  const uniqueTransactions = new Map<string, CsvRow>();
  for (const row of [...transactionRowsOne, ...transactionRowsTwo]) {
    uniqueTransactions.set(transactionKey(row), row);
  }
  const orphanVisits = new Set<string>();
  for (const row of uniqueTransactions.values()) {
    const visitId = valueFor(row, ["Visit ID", "VisitID"]);
    if (visitId && !consultationsByVisit.has(visitId)) orphanVisits.add(visitId);
  }

  await mkdir(options.outputDirectory, { recursive: true });
  await Promise.all([
    writeCsv(options.outputDirectory, "patient_matches.csv", ["source_patient_ref", "existing_patient_ref", "match_kind", "reason", "conflict_fields"], matchRows),
    writeCsv(options.outputDirectory, "patient_review.csv", ["source_patient_ref", "existing_patient_ref", "match_kind", "reason", "conflict_fields"], reviewRows),
    writeCsv(options.outputDirectory, "unresolved_doctors.csv", ["source_doctor_ref", "consultation_count", "reason"], [...doctorCounts.entries()].sort().map(([sourceDoctorRef, consultationCount]) => ({ source_doctor_ref: sourceDoctorRef, consultation_count: consultationCount, reason: roster.configured ? "No exact normalized roster match" : "Klinik Awfa roster lookup not configured" }))),
    writeCsv(options.outputDirectory, "orphan_financial_visits.csv", ["source_visit_ref", "reason"], [...orphanVisits].sort().map((visitId) => ({ source_visit_ref: reportReference("source-visit", visitId), reason: "No consultation export row" }))),
    writeFile(join(options.outputDirectory, "summary.json"), `${JSON.stringify({
      reportVersion: 1,
      sourceFiles: requiredFiles.map((filename) => basename(filename)),
      rosterLookup: roster.configured ? "configured-read-only" : "not-configured",
      patientRows: patientRows.length,
      patientDecisions: decisionCounts,
      consultationRows: consultationRows.length,
      transactionRows: transactionRowsOne.length + transactionRowsTwo.length,
      uniqueTransactions: uniqueTransactions.size,
      duplicateTransactionsRemoved: transactionRowsOne.length + transactionRowsTwo.length - uniqueTransactions.size,
      unresolvedDoctors: doctorCounts.size,
      orphanFinancialVisits: orphanVisits.size,
      writesPerformed: 0,
    }, null, 2)}\n`, "utf8"),
  ]);

  console.log(`Sanitized dry-run reports written to ${options.outputDirectory}. Database writes performed: 0.`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runDryRun(commandOptions(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export { commandOptions, parseCsv, runDryRun, transactionKey };
