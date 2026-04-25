import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://ncysmppzfjtiekfnomdv.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeXNtcHB6Zmp0aWVrZm5vbWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MTIzNTEsImV4cCI6MjA4NTQ4ODM1MX0.4JUfcL915cqt42h-gocFeZ4OQQT27BOtI0YaQSPxlCg';

const sb = createClient(SUPABASE_URL, ANON);

// Parse rows from /tmp/diagnoses_inserts_fixed.sql
const sql = fs.readFileSync('/tmp/diagnoses_inserts_fixed.sql','utf8');
const m = sql.match(/values\s*\n([\s\S]*?)\non conflict/);
const rowsBlock = m[1];
const rowRegex = /\(\s*'((?:[^'\\]|\\.|'')*)',\s*'((?:[^'\\]|\\.|'')*)',\s*'((?:[^'\\]|\\.|'')*)',\s*'((?:[^'\\]|\\.|'')*)',\s*'((?:[^'\\]|\\.|'')*)'\s*\)/g;
const records = [];
let mm;
while ((mm = rowRegex.exec(rowsBlock)) !== null) {
  records.push({
    name: mm[1].replace(/''/g, "'"),
    icd10_code: mm[2],
    group_category: mm[3],
    search_aliases: mm[4].replace(/''/g, "'"),
    status: mm[5],
  });
}
console.log('parsed', records.length, 'rows');

const BATCH = 500;
let total = 0;
for (let i = 0; i < records.length; i += BATCH) {
  const slice = records.slice(i, i + BATCH);
  const { error, data } = await sb
    .from('diagnoses')
    .upsert(slice, { onConflict: 'icd10_code,search_aliases', ignoreDuplicates: false })
    .select('id');
  if (error) {
    console.error('batch', i, 'error:', error);
    process.exit(1);
  }
  total += (data?.length ?? slice.length);
  console.log(`batch ${i / BATCH + 1}: inserted/upserted ${data?.length ?? '?'} (cum ${total})`);
}
console.log('DONE total=', total);
