#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const queryPath = resolve(__dirname, "dump-pg-policies.sql");

console.log(readFileSync(queryPath, "utf8"));
console.error([
  "",
  "Safety reminder:",
  "- This command only prints the read-only query; it does not connect to any database.",
  "- Run the SQL manually only against an explicitly approved local/staging database.",
  "- Do not run against production without separate DocM3d approval."
].join("\n"));
