// Explicit maintenance command, not part of loading. Only the authorized brand spelling changes.
// Existing snapshots/hashes must already match before any source content is changed.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseCompanyData, readPack, rows, sha256, text, workspaceRoot } from './pack.js';

const canonicalize = (content: string): string =>
  content
    .replace(/\bAsterbyte(?: Studio| Solutions)?\b/g, 'AsterByte Solutions')
    .replace(/AsterByte Solutions's/g, "AsterByte Solutions'");

const pack = await readPack(false);
// Check supplied evidence before regenerating it; never silently absorb unrelated Markdown changes.
for (const document of rows(pack.data, 'knowledge_documents')) {
  const content = await readFile(resolve(workspaceRoot, text(document, 'source_path')), 'utf8');
  if (content !== document.content_markdown || sha256(content) !== document.content_sha256) {
    throw new Error(
      `Source snapshot/hash changed before branding correction: ${text(document, 'source_path')}.`,
    );
  }
}
for (const folder of ['docs/knowledge-base', 'docs/database-plan']) {
  for (const name of await readdir(resolve(workspaceRoot, folder))) {
    if (!name.endsWith('.md')) continue;
    const path = resolve(workspaceRoot, folder, name);
    const original = await readFile(path, 'utf8');
    const corrected = canonicalize(original);
    if (corrected !== original) await writeFile(path, corrected, 'utf8');
  }
}
const definitionPath = resolve(workspaceRoot, 'docs/database-plan/schema-definition.json');
const originalDefinition = await readFile(definitionPath, 'utf8');
await writeFile(definitionPath, canonicalize(originalDefinition), 'utf8');
const dataPath = resolve(workspaceRoot, 'docs/database-plan/company-data.json');
const correctedData = parseCompanyData(JSON.parse(canonicalize(JSON.stringify(pack.data))));
// Read the canonicalized source for the generated snapshots; preserve UUIDs, versions and statuses.
// The row schemas and complete contract are checked by readPack after writing this derived artifact.
const documents = rows(correctedData, 'knowledge_documents');
for (const document of documents) {
  const content = await readFile(resolve(workspaceRoot, text(document, 'source_path')), 'utf8');
  document.content_markdown = content;
  document.content_sha256 = sha256(content);
}
await writeFile(dataPath, JSON.stringify(correctedData, null, 2) + '\n', 'utf8');
await readPack();
console.log(
  'Canonical branding synchronized; UUIDs/versions/statuses retained and source snapshots/hashes verified.',
);
