import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { workspaceRoot } from './pack.js';

// Explicit operator command. Retains configured values; never echoes generated credentials.
const path = resolve(workspaceRoot, '.env');
let source = await readFile(path, 'utf8');
const existing = parseEnv(source);
const added: string[] = [];
for (const name of ['BOLNA_TOOL_AUTH_TOKEN', 'BOLNA_WEBHOOK_SECRET']) {
  if (existing[name]?.trim()) continue;
  const assignment = `${name}=${randomBytes(32).toString('hex')}`;
  const blankLine = new RegExp(`^${name}=\\s*$`, 'm');
  if (blankLine.test(source)) source = source.replace(blankLine, assignment);
  else source += `\n${assignment}\n`;
  added.push(name);
}
if (added.length) await writeFile(path, source, { encoding: 'utf8', mode: 0o600 });
console.log(
  `Local secrets prepared; ${added.length} missing values generated. Existing credentials retained; no values printed. Restart the backend after configuration changes.`,
);
