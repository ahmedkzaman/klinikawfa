import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { streamCsvRows, valueFor } from './streamCsv.ts';

const SQL_ROWS_PER_BATCH = 1_000;
const MAX_CASE_NOTE_BYTES = 100_000;

type Manifest = {
  batches: Array<{ phase: string; filename: string }>;
};

function argumentMap(args: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('Invalid arguments');
    values.set(key, value);
  }
  return values;
}

function sqlFor(rows: Array<{ sourceVisitId: string; caseNote: string }>): string {
  const values = rows.map(({ sourceVisitId, caseNote }) => {
    const encoded = Buffer.from(caseNote, 'utf8').toString('base64');
    return `  ('${sourceVisitId}', '${encoded}')`;
  }).join(',\n');

  return `begin;
set local lock_timeout = '30s';
set local statement_timeout = 0;
set local session_replication_role = replica;

create temporary table yezza_case_note_backfill (
  source_visit_id text primary key,
  case_note text not null
) on commit drop;

insert into yezza_case_note_backfill (source_visit_id, case_note)
select source_visit_id, convert_from(decode(note_base64, 'base64'), 'UTF8')
from (values
${values}
) as source_notes(source_visit_id, note_base64);

update public.consultations as consultation
set case_note = source_note.case_note || E'\\n\\nsource_system=yezza; source_visit_id=' || source_note.source_visit_id
from yezza_case_note_backfill as source_note
join public.visit_external_ids as external_visit
  on external_visit.source_system = 'yezza'
 and external_visit.source_visit_id = source_note.source_visit_id
where consultation.queue_entry_id = external_visit.queue_entry_id
  and consultation.entry_source = 'legacy_import';

do $verify$
begin
  if exists (
    select 1
    from yezza_case_note_backfill as source_note
    left join public.visit_external_ids as external_visit
      on external_visit.source_system = 'yezza'
     and external_visit.source_visit_id = source_note.source_visit_id
    left join public.consultations as consultation
      on consultation.queue_entry_id = external_visit.queue_entry_id
     and consultation.entry_source = 'legacy_import'
    where consultation.id is null
       or consultation.case_note is distinct from
          source_note.case_note || E'\\n\\nsource_system=yezza; source_visit_id=' || source_note.source_visit_id
  ) then
    raise exception 'YEZZA_CASE_NOTE_BACKFILL_INCOMPLETE';
  end if;
end
$verify$;

set local session_replication_role = origin;
commit;
`;
}

export async function prepareCaseNoteBackfill(options: {
  consultationCsv: string;
  manifestPath: string;
  outputDirectory: string;
}): Promise<{ importedVisits: number; caseNotes: number; batches: number }> {
  const manifestPath = resolve(options.manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  const manifestDirectory = dirname(manifestPath);
  const importedVisitIds = new Set<string>();

  for (const batch of manifest.batches.filter((candidate) => candidate.phase === 'visits')) {
    const payload = JSON.parse(await readFile(join(manifestDirectory, batch.filename), 'utf8')) as {
      visits: Array<{ sourceVisitId: string }>;
    };
    for (const visit of payload.visits) importedVisitIds.add(visit.sourceVisitId);
  }

  const notes: Array<{ sourceVisitId: string; caseNote: string }> = [];
  const oversized: Array<{ sourceVisitId: string; bytes: number }> = [];
  const seen = new Set<string>();
  for await (const { row } of streamCsvRows(resolve(options.consultationCsv))) {
    const sourceVisitId = valueFor(row, ['Visit ID', 'VisitID']);
    if (!importedVisitIds.has(sourceVisitId)) continue;
    if (seen.has(sourceVisitId)) throw new Error(`Duplicate imported visit ${sourceVisitId}`);
    seen.add(sourceVisitId);
    const caseNote = valueFor(row, ['Case Note']);
    if (caseNote) {
      const bytes = Buffer.byteLength(caseNote, 'utf8');
      if (bytes > MAX_CASE_NOTE_BYTES) oversized.push({ sourceVisitId, bytes });
      else notes.push({ sourceVisitId, caseNote });
    }
  }

  if (seen.size !== importedVisitIds.size) {
    throw new Error(`Matched ${seen.size} of ${importedVisitIds.size} imported visits in consultations.csv`);
  }

  const outputDirectory = resolve(options.outputDirectory);
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  let batches = 0;
  for (let index = 0; index < notes.length; index += SQL_ROWS_PER_BATCH) {
    batches += 1;
    await writeFile(
      join(outputDirectory, `case-notes-${String(batches).padStart(4, '0')}.sql`),
      sqlFor(notes.slice(index, index + SQL_ROWS_PER_BATCH)),
      { encoding: 'utf8', mode: 0o600 },
    );
  }

  await writeFile(
    join(outputDirectory, 'summary.json'),
    `${JSON.stringify({ importedVisits: importedVisitIds.size, caseNotes: notes.length, oversized: oversized.length, batches }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  await writeFile(
    join(outputDirectory, 'oversized-case-notes.json'),
    `${JSON.stringify(oversized, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  return { importedVisits: importedVisitIds.size, caseNotes: notes.length, batches };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = argumentMap(process.argv.slice(2));
  const consultationCsv = args.get('--consultations');
  const manifestPath = args.get('--manifest');
  const outputDirectory = args.get('--output-dir');
  if (!consultationCsv || !manifestPath || !outputDirectory) {
    throw new Error('Required: --consultations, --manifest, --output-dir');
  }
  prepareCaseNoteBackfill({ consultationCsv, manifestPath, outputDirectory })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
