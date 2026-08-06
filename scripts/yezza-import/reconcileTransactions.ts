import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv } from "./dryRun.ts";
import {
  deduplicateTransactions,
  matchesExpectedYezzaReconciliation,
  reconcileTransactions,
  type TransactionReconciliation,
  type YezzaTransaction,
} from "./transformTransactions.ts";

type CsvRow = Record<string, string>;

export interface ReconciliationRun {
  sourceFiles: string[];
  inputRows: number;
  duplicateRowsRemoved: number;
  reconciliation: TransactionReconciliation;
  matchesExpectedBaseline: boolean;
}

function headerKey(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
}

function valueFor(row: CsvRow, names: string[]): string {
  const fields = new Map(Object.entries(row).map(([key, value]) => [headerKey(key), value.trim()]));
  for (const name of names) {
    const value = fields.get(headerKey(name));
    if (value !== undefined) return value;
  }
  return "";
}

/** Maps the source export headers only; it does not mutate source rows. */
export function csvRowsToYezzaTransactions(rows: readonly CsvRow[]): YezzaTransaction[] {
  return rows.map((row) => ({
    sourceVisitId: valueFor(row, ["Visit ID", "VisitID"]),
    billNumber: valueFor(row, ["Bill#", "Bill #", "Bill Number", "Bill No"]),
    totalAmount: valueFor(row, ["Total (RM)", "Total"]),
    paidAmount: valueFor(row, ["Paid Amount (RM)", "Paid Amount"]),
    method: valueFor(row, ["Payment Method", "Method"]),
    channel: valueFor(row, ["Payment Channel", "Channel"]),
    status: valueFor(row, ["Status"]),
  }));
}

/** Reads only the supplied local exports and returns no data other than totals. */
export async function reconcileTransactionFiles(firstPath: string, secondPath: string): Promise<ReconciliationRun> {
  const [firstContent, secondContent] = await Promise.all([readFile(firstPath, "utf8"), readFile(secondPath, "utf8")]);
  const rows = csvRowsToYezzaTransactions([...parseCsv(firstContent), ...parseCsv(secondContent)]);
  const uniqueRows = deduplicateTransactions(rows);
  const reconciliation = reconcileTransactions(uniqueRows);
  return {
    sourceFiles: [basename(firstPath), basename(secondPath)],
    inputRows: rows.length,
    duplicateRowsRemoved: rows.length - uniqueRows.length,
    reconciliation,
    matchesExpectedBaseline: matchesExpectedYezzaReconciliation(reconciliation),
  };
}

function commandPaths(argumentsList: string[]): { firstPath: string; secondPath: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Usage: npm run yezza:reconcile -- --transactions-one <transactions_1.csv> --transactions-two <transactions_2.csv>");
    }
    values.set(key, value);
  }
  const firstPath = values.get("--transactions-one");
  const secondPath = values.get("--transactions-two");
  if (!firstPath || !secondPath) {
    throw new Error("Both --transactions-one and --transactions-two are required.");
  }
  return { firstPath: resolve(firstPath), secondPath: resolve(secondPath) };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const { firstPath, secondPath } = commandPaths(process.argv.slice(2));
  reconcileTransactionFiles(firstPath, secondPath)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.matchesExpectedBaseline) process.exitCode = 1;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
