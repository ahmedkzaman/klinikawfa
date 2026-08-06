import { createReadStream } from "node:fs";

export type CsvRow = Record<string, string>;

function headerKey(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
}

export function valueFor(row: CsvRow, names: readonly string[]): string {
  const fields = new Map(Object.entries(row).map(([key, value]) => [headerKey(key), value.trim()]));
  for (const name of names) {
    const value = fields.get(headerKey(name));
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

async function* csvRecords(path: string): AsyncGenerator<string[]> {
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let pendingQuote = false;

  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    for (const character of chunk as string) {
      if (pendingQuote) {
        if (character === '"') {
          value += '"';
          pendingQuote = false;
          continue;
        }
        quoted = false;
        pendingQuote = false;
      }
      if (character === '"') {
        if (quoted) pendingQuote = true;
        else quoted = true;
      } else if (character === "," && !quoted) {
        row.push(value);
        value = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r") continue;
        row.push(value);
        if (row.some((cell) => cell.length > 0)) yield row;
        row = [];
        value = "";
      } else {
        value += character;
      }
    }
  }
  if (pendingQuote) quoted = false;
  if (quoted) throw new Error(`Unterminated quoted field in ${path}`);
  row.push(value);
  if (row.some((cell) => cell.length > 0)) yield row;
}

export async function* streamCsvRows(path: string): AsyncGenerator<{ row: CsvRow; locatorIndex: number }> {
  let header: string[] | null = null;
  let locatorIndex = 2;
  for await (const cells of csvRecords(path)) {
    if (!header) {
      header = cells.map((cell, index) => (index === 0 ? cell.replace(/^\uFEFF/, "") : cell).trim());
      continue;
    }
    yield {
      row: Object.fromEntries(header.map((column, index) => [column, cells[index] ?? ""])),
      locatorIndex,
    };
    locatorIndex += 1;
  }
}
