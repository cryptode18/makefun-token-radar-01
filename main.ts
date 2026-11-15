import { cpSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';

/** Read CLI flags without a dependency so Node 24 can execute this file directly. */
function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`);
  return value;
}

function snapshotPath(input: string): string {
  const absolute = resolve(input);
  if (!existsSync(absolute)) throw new Error(`input does not exist: ${absolute}`);
  return statSync(absolute).isDirectory() ? join(absolute, 'snapshot.json') : absolute;
}

const input = option('--input', '/input');
const outputDefault = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const outDir = resolve(option('--output', outputDefault));
const snapshot = parseSnapshot(readFileSync(snapshotPath(input), 'utf8'));
const radar = buildRadar(snapshot);
const issue = boardIssue(radar.rows, snapshot);
if (issue) throw new Error(`refusing to write invalid board: ${issue}`);

cpSync('dashboard', join(outDir, 'dashboard'), { recursive: true });
cpSync('screenshots', join(outDir, 'screenshots'), { recursive: true });
writeFileSync(
  join(outDir, 'board.json'),
  `${JSON.stringify({ rows: radar.rows }, null, 2)}\n`,
);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, {
  text_max_bytes: 65536,
  screenshots: { max: 4, max_bytes: 524288 },
  dashboard: { max_files: 400, max_bytes: 4194304 },
}));
console.log(`board rows=${radar.board_size} watchlist=${radar.watchlist_size} early=${radar.early_size}`);
