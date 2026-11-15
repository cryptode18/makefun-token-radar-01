import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const [outputDir, snapshotPath] = process.argv.slice(2);
let failures = 0;
let rows = [];

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL ${name} - ${message}`);
    failures++;
  }
}

function fail(message) {
  throw new Error(message);
}

function listFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function imageDimensions(bytes) {
  if (bytes[0] === 137 && bytes[1] === 80) {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  for (let i = 0; i < bytes.length - 8; i++) {
    if (bytes[i] !== 0xff) continue;
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: bytes.readUInt16BE(i + 5),
        width: bytes.readUInt16BE(i + 7),
      };
    }
  }

  fail('screenshot is not a PNG or JPEG with dimensions');
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const protocolSlugs = new Set(snapshot.protocols.map((protocol) => protocol.slug));

test('dashboard_files', () => {
  const dashboardDir = join(outputDir, 'dashboard');
  const files = listFiles(dashboardDir);
  const names = files.map((file) => file.split('/').pop());
  const totalBytes = files.reduce((sum, file) => sum + statSync(file).size, 0);

  if (!names.includes('index.html')) fail('dashboard is missing index.html');
  if (!names.some((name) => name.endsWith('.css'))) fail('dashboard is missing a CSS file');
  if (!names.some((name) => name.endsWith('.js'))) fail('dashboard is missing a JavaScript file');
  if (files.length > 400) fail(`dashboard has ${files.length} files, over 400`);
  if (totalBytes > 4194304) fail(`dashboard is ${totalBytes} bytes, over 4194304`);

  for (const file of files) {
    const name = file.split('/').pop();
    if (!/^[A-Za-z0-9._-]+$/.test(name)) fail(`invalid dashboard file name: ${name}`);
    const text = readFileSync(file, 'utf8');
    if (text.includes('http://') || text.includes('https://')) {
      fail(`network address in dashboard file: ${name}`);
    }
  }
});

test('board_file', () => {
  const boardPath = join(outputDir, 'board.json');
  const bytes = readFileSync(boardPath);
  if (bytes.length > 8388608) fail(`board.json is ${bytes.length} bytes, over 8388608`);

  const board = JSON.parse(bytes.toString('utf8'));
  rows = Array.isArray(board) ? board : board.rows;
  if (!Array.isArray(rows)) fail('board.json must be an array or object with rows array');
  if (rows.length < 100 || rows.length > 4000) fail(`board has ${rows.length} rows, outside 100..4000`);

  for (const row of rows) {
    if (!protocolSlugs.has(row.slug)) fail(`unknown protocol slug: ${row.slug}`);
    if (typeof row.name !== 'string' || row.name.length === 0) fail(`invalid name for ${row.slug}`);
    if (!Number.isInteger(row.rank) || row.rank < 1) fail(`invalid rank for ${row.slug}`);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 1e14) {
      fail(`invalid implied_value_usd for ${row.slug}`);
    }
    if (!Array.isArray(row.farm_steps)) fail(`farm_steps is not an array for ${row.slug}`);
  }
});

test('sorted_by_value', () => {
  if (new Set(rows.map((row) => row.implied_value_usd)).size < 2) {
    fail('board must have at least 2 distinct implied values');
  }

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].rank !== i + 1) fail(`rank at row ${i + 1} is not ${i + 1}`);
    if (i > 0 && rows[i].implied_value_usd > rows[i - 1].implied_value_usd) {
      fail(`implied values increase at row ${i + 1}`);
    }
  }
});

test('coverage', () => {
  const boardSlugs = new Set(rows.map((row) => row.slug));
  const missing = snapshot.watchlist.filter((slug) => !boardSlugs.has(slug));
  if (missing.length > 0) fail(`missing watchlist slugs: ${missing.join(', ')}`);
});

test('farm_steps', () => {
  for (const row of rows) {
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      fail(`${row.slug} has ${row.farm_steps.length} farm steps, outside 3..12`);
    }
    for (const step of row.farm_steps) {
      if (typeof step !== 'string' || step.trim().length < 20 || step.trim().length > 600) {
        fail(`invalid farm step for ${row.slug}`);
      }
    }
  }
});

test('screenshots', () => {
  const screenshotsDir = join(outputDir, 'screenshots');
  const files = readdirSync(screenshotsDir)
    .filter((name) => !name.startsWith('.'))
    .map((name) => join(screenshotsDir, name));

  if (files.length < 3 || files.length > 4) fail(`screenshots has ${files.length} files, outside 3..4`);

  for (const file of files) {
    const bytes = readFileSync(file);
    if (bytes.length > 524288) fail(`${file} is ${bytes.length} bytes, over 524288`);
    const { width, height } = imageDimensions(bytes);
    const larger = Math.max(width, height);
    const smaller = Math.min(width, height);
    if (larger > 1440 || smaller < 800) {
      fail(`${file} dimensions ${width}x${height} are outside 800..1440`);
    }
  }
});

test('dossier_matches', () => {
  const dossierPath = join(outputDir, 'dossier.json');
  const dossier = readFileSync(dossierPath);
  const expected = buildDossier(outputDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });

  if (!dossier.equals(expected)) fail('dossier.json does not match buildDossier output');
  if (dossier.length > 1572864) fail(`dossier.json is ${dossier.length} bytes, over 1572864`);
});

if (failures > 0) process.exitCode = 1;
