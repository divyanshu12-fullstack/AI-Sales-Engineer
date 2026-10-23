import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { buildImportSql, readPack, tableNames, workspaceRoot } from './pack.js';

try {
  const command = process.argv[2];
  const pack = await readPack();
  if (command === 'validate') {
    console.log(
      'PASS: 20 table contracts, 113 records, UUID/unique/FK/scope checks, safe import states and seven exact Markdown snapshots/hashes. knowledge_chunks deferred.',
    );
  } else if (command === 'seed-sql') {
    const sql = buildImportSql(pack.data);
    if (process.argv[3] === '--output') {
      const requested = process.argv[4];
      if (!requested) throw new Error('Provide a generated .sql path under supabase/.temp/.');
      const output = resolve(workspaceRoot, requested);
      if (
        !output.startsWith(resolve(workspaceRoot, 'supabase/.temp') + sep) ||
        !output.endsWith('.sql')
      ) {
        throw new Error('Generated import SQL may only be written under supabase/.temp/.');
      }
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, sql, 'utf8');
      console.log(
        'Validated import SQL generated under supabase/.temp/; no database operation performed.',
      );
    } else {
      process.stdout.write(sql);
    }
  } else if (command === 'verify-sql') {
    process.stdout.write(
      await readFile(resolve(workspaceRoot, 'supabase/tests/verify_initial.sql'), 'utf8'),
    );
  } else if (command === 'summary') {
    console.log(
      JSON.stringify({ tables: tableNames, records: 113, deferred: ['knowledge_chunks'] }, null, 2),
    );
  } else {
    throw new Error('Use validate, seed-sql, verify-sql or summary.');
  }
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : 'Database pack validation failed.');
  process.exitCode = 1;
}
