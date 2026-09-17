#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KINDS = ['Vehicles', 'Outfits'];
const FORMATS = {
  Vehicles: new Set(['.xml', '.txt', '.ini', '.json']),
  Outfits: new Set(['.txt', '.ini', '.json'])
};

function parseArgs(argv) {
  const options = {
    command: argv[0] || '',
    source: path.resolve(__dirname, '..', '..', '..', 'INF_DATA'),
    stage: path.join(process.env.LOCALAPPDATA || os.homedir(), 'Nenyoo', 'Plus', 'CatalogCapture'),
    dryRun: false,
    limit: 0
  };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--source' && argv[i + 1]) options.source = path.resolve(argv[++i]);
    else if (argv[i] === '--stage' && argv[i + 1]) options.stage = path.resolve(argv[++i]);
    else if (argv[i] === '--dry-run') options.dryRun = true;
    else if (argv[i] === '--limit' && argv[i + 1]) options.limit = Math.max(0, Number.parseInt(argv[++i], 10) || 0);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!['prepare', 'sync'].includes(options.command)) {
    throw new Error('Usage: node Site/tools/catalog-capture.js <prepare|sync> [--source PATH] [--stage PATH] [--limit N] [--dry-run]');
  }
  return options;
}

function cleanRelative(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.?\/?data\//i, '').replace(/^\.\//, '');
}

function inside(root, relative) {
  const target = path.resolve(root, ...cleanRelative(relative).split('/'));
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (target !== root && !target.startsWith(prefix)) throw new Error(`Path escapes source root: ${relative}`);
  return target;
}

function idFor(kind, relative) {
  return crypto.createHash('sha256').update(`${kind}\n${relative.toLowerCase()}`).digest('hex').slice(0, 24);
}

function readManifests(source) {
  return KINDS.map((kind) => {
    const manifest = path.join(source, kind, 'model_results.json');
    const rows = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (!Array.isArray(rows)) throw new Error(`${manifest} must contain an array`);
    return { kind, manifest, rows };
  });
}

function collect(source) {
  const entries = [];
  const ignored = [];
  for (const data of readManifests(source)) {
    data.rows.forEach((row, rowIndex) => {
      const relative = cleanRelative(row.file);
      const extension = path.extname(relative).toLowerCase();
      if (!FORMATS[data.kind].has(extension)) {
        ignored.push({ kind: data.kind, file: relative, reason: `unsupported ${extension || '(none)'}` });
        return;
      }
      if (Array.isArray(row.images) && row.images.length) return;
      const absolute = inside(source, relative);
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
        ignored.push({ kind: data.kind, file: relative, reason: 'source missing' });
        return;
      }
      const id = idFor(data.kind, relative);
      entries.push({
        id,
        kind: data.kind === 'Vehicles' ? 'vehicle' : 'outfit',
        extension: extension.slice(1),
        relative,
        absolute,
        input: path.join('input', id + extension),
        output: path.join('output', `${id}.png`),
        model: String(row.model || ''),
        hash: String(row.hash == null ? '' : row.hash),
        rowIndex
      });
    });
  }
  return { entries, ignored };
}

function queueLine(entry) {
  const fields = [entry.id, entry.kind, entry.extension, entry.input, entry.output, entry.model, entry.hash, entry.relative];
  if (fields.some((field) => /[\t\r\n]/.test(field))) throw new Error(`Unsupported control character in ${entry.relative}`);
  return fields.join('\t');
}

function prepare(options) {
  const collected = collect(options.source);
  const entries = options.limit ? collected.entries.slice(0, options.limit) : collected.entries;
  const ignored = collected.ignored;
  console.log(`Queue: ${entries.length} missing previews; ignored: ${ignored.length}`);
  for (const item of ignored.slice(0, 25)) console.log(`  ignored ${item.kind}: ${item.file} (${item.reason})`);
  if (ignored.length > 25) console.log(`  ... ${ignored.length - 25} more ignored`);
  if (options.dryRun) return;

  const inputRoot = path.join(options.stage, 'input');
  const outputRoot = path.join(options.stage, 'output');
  fs.mkdirSync(inputRoot, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const entry of entries) fs.copyFileSync(entry.absolute, path.join(options.stage, entry.input));
  fs.writeFileSync(path.join(options.stage, 'queue.tsv'), entries.map(queueLine).join('\n') + (entries.length ? '\n' : ''));
  fs.writeFileSync(path.join(options.stage, 'queue.json'), JSON.stringify({ schemaVersion: 1, source: options.source, entries }, null, 2) + '\n');
  fs.writeFileSync(path.join(options.stage, 'progress.txt'), '0\n');
  console.log(`Prepared ${entries.length} inputs in ${options.stage}`);
}

function isPng(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size < 64) return false;
  const signature = fs.readFileSync(file).subarray(0, 8);
  return signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function nextImageName(directory) {
  const used = new Set(fs.existsSync(directory)
    ? fs.readdirSync(directory).map((name) => name.toLowerCase())
    : []);
  for (let index = 1; ; index += 1) {
    const name = `image_${index}.png`;
    if (!used.has(name)) return name;
  }
}

function sync(options) {
  const queuePath = path.join(options.stage, 'queue.json');
  if (!fs.existsSync(queuePath)) throw new Error(`Capture queue not found: ${queuePath}`);
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const manifests = new Map(readManifests(options.source).map((item) => [item.kind, item]));
  let copied = 0;
  let failed = 0;

  for (const entry of queue.entries) {
    const png = path.join(options.stage, entry.output);
    if (!isPng(png)) { failed += 1; continue; }
    const manifest = manifests.get(entry.kind === 'vehicle' ? 'Vehicles' : 'Outfits');
    const row = manifest.rows[entry.rowIndex];
    if (!row || cleanRelative(row.file).toLowerCase() !== entry.relative.toLowerCase()) {
      throw new Error(`Manifest changed since prepare near ${entry.relative}; prepare a fresh queue`);
    }
    if (Array.isArray(row.images) && row.images.length) continue;
    const preset = inside(options.source, entry.relative);
    const directory = path.dirname(preset);
    const imageName = nextImageName(directory);
    const imagePath = path.join(directory, imageName);
    const manifestPath = ['data', ...path.relative(options.source, imagePath).split(path.sep)].join('/');
    if (!options.dryRun) fs.copyFileSync(png, imagePath);
    row.images = [manifestPath];
    copied += 1;
  }

  if (!options.dryRun) {
    for (const data of manifests.values()) {
      const temp = data.manifest + '.tmp';
      fs.writeFileSync(temp, JSON.stringify(data.rows, null, 2) + '\n');
      fs.renameSync(temp, data.manifest);
    }
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build-mod-catalog.js'), '--source', options.source], { stdio: 'inherit' });
  }
  console.log(`${options.dryRun ? 'Would sync' : 'Synced'} ${copied} previews; ${failed} outputs missing or invalid.`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.source)) throw new Error(`INF_DATA source not found: ${options.source}`);
  if (options.command === 'prepare') prepare(options);
  else sync(options);
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
