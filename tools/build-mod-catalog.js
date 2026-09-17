#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SITE_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(SITE_ROOT, 'mod-data');
const SOURCE_BASE_URL = 'https://raw.githubusercontent.com/XXTOUCOXX/INF_DATA/refs/heads/main/';
const CATALOGS = ['Vehicles', 'Outfits'];
const CHUNK_SIZE = 256;
const SUPPORTED_FORMATS = {
  Vehicles: new Set(['.xml', '.txt', '.ini', '.json']),
  Outfits: new Set(['.txt', '.ini', '.json'])
};

function parseArgs(argv) {
  const options = {
    check: false,
    source: path.resolve(__dirname, '..', '..', '..', 'INF_DATA')
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') options.check = true;
    else if (argv[i] === '--source' && argv[i + 1]) options.source = path.resolve(argv[++i]);
    else if (argv[i] === '--help') {
      console.log('Usage: node Site/tools/build-mod-catalog.js [--source PATH] [--check]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return options;
}

function normalizeRelativePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.?\/?data\//i, '')
    .replace(/^\.\//, '');
}

function resolveInside(root, relativePath) {
  const target = path.resolve(root, ...relativePath.split('/'));
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (target !== root && !target.startsWith(prefix)) {
    throw new Error(`Path escapes INF_DATA: ${relativePath}`);
  }
  return target;
}

function displayName(relativePath, fallback) {
  const extension = path.extname(relativePath);
  const stem = path.basename(relativePath, extension) || fallback || 'Untitled';
  const formatted = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return formatted || 'Untitled preset';
}

function stableId(kind, relativePath) {
  return `${kind.toLowerCase()}-${crypto.createHash('sha256').update(relativePath).digest('hex').slice(0, 16)}`;
}

function sourceInfo(sourceRoot) {
  let revision = 'local';
  const gitPath = path.join(sourceRoot, '.git');
  try {
    let gitDir = gitPath;
    if (fs.statSync(gitPath).isFile()) {
      const match = fs.readFileSync(gitPath, 'utf8').match(/^gitdir:\s*(.+)$/m);
      if (match) gitDir = path.resolve(sourceRoot, match[1].trim());
    }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5);
      const looseRef = path.join(gitDir, ...ref.split('/'));
      if (fs.existsSync(looseRef)) revision = fs.readFileSync(looseRef, 'utf8').trim();
      else {
        const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8').split(/\r?\n/);
        const line = packed.find((entry) => entry.endsWith(' ' + ref));
        if (line) revision = line.split(' ')[0];
      }
    } else if (/^[0-9a-f]{40}$/i.test(head)) revision = head;
  } catch (_) {
    // A source folder without Git metadata is supported; the manifest time remains deterministic.
  }
  const manifestTimes = CATALOGS.map((kind) => fs.statSync(path.join(sourceRoot, kind, 'model_results.json')).mtimeMs);
  return { revision, generatedAt: new Date(Math.max(...manifestTimes)).toISOString() };
}

function buildCatalog(sourceRoot, kind, info) {
  const manifestPath = path.join(sourceRoot, kind, 'model_results.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing manifest: ${manifestPath}`);
  const records = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(records)) throw new Error(`${manifestPath} must contain an array`);

  const items = [];
  const missing = [];
  const seen = new Set();

  for (const record of records) {
    const downloadPath = normalizeRelativePath(record.file);
    if (!downloadPath) {
      missing.push('(empty file field)');
      continue;
    }

    if (!SUPPORTED_FORMATS[kind].has(path.extname(downloadPath).toLowerCase())) continue;

    const key = downloadPath.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const localPath = resolveInside(sourceRoot, downloadPath);
    if (!fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) {
      missing.push(downloadPath);
      continue;
    }

    const previews = [];
    for (const rawPreview of Array.isArray(record.images) ? record.images : []) {
      const preview = normalizeRelativePath(rawPreview);
      if (!preview || previews.includes(preview)) continue;
      const previewPath = resolveInside(sourceRoot, preview);
      if (fs.existsSync(previewPath) && fs.statSync(previewPath).isFile()) previews.push(preview);
    }

    const segments = downloadPath.split('/');
    const extension = path.extname(downloadPath).slice(1).toUpperCase() || 'FILE';
    items.push({
      id: stableId(kind, downloadPath),
      name: displayName(downloadPath, record.folder),
      filename: path.basename(downloadPath),
      model: String(record.model || 'Unknown'),
      hash: record.hash == null ? '' : String(record.hash),
      category: segments[1] || 'Other',
      format: extension,
      path: downloadPath,
      previews
    });
  }

  items.sort((a, b) =>
    a.model.localeCompare(b.model, 'en', { sensitivity: 'base', numeric: true }) ||
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }) ||
    a.path.localeCompare(b.path, 'en', { sensitivity: 'base', numeric: true })
  );

  const uniqueSorted = (field) => [...new Set(items.map((item) => item[field]))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));

  return {
    data: {
      schemaVersion: 1,
      kind: kind.toLowerCase(),
      generatedAt: info.generatedAt,
      sourceRevision: info.revision,
      sourceBaseUrl: SOURCE_BASE_URL,
      totalItems: items.length,
      totalModels: new Set(items.map((item) => item.model)).size,
      categories: uniqueSorted('category'),
      formats: uniqueSorted('format'),
      items
    },
    report: { sourceRecords: records.length, included: items.length, missing }
  };
}

function outputFiles(sourceRoot) {
  const info = sourceInfo(sourceRoot);
  const results = CATALOGS.map((kind) => [kind, buildCatalog(sourceRoot, kind, info)]);
  const files = new Map();

  for (const [kind, result] of results) {
    const slug = kind.toLowerCase();
    const data = result.data;
    const models = [...new Set(data.items.map((item) => item.model))];
    const modelIndexes = new Map(models.map((model, index) => [model, index]));
    const categoryIndexes = new Map(data.categories.map((category, index) => [category, index]));
    const formatIndexes = new Map(data.formats.map((format, index) => [format, index]));
    const index = {
      schemaVersion: 2,
      kind: slug,
      generatedAt: data.generatedAt,
      sourceRevision: data.sourceRevision,
      sourceBaseUrl: data.sourceBaseUrl,
      totalItems: data.totalItems,
      totalModels: data.totalModels,
      chunkSize: CHUNK_SIZE,
      models,
      categories: data.categories,
      formats: data.formats,
      items: data.items.map((item) => [
        item.name,
        item.filename,
        item.hash,
        modelIndexes.get(item.model),
        categoryIndexes.get(item.category),
        formatIndexes.get(item.format)
      ])
    };
    files.set(`${slug}/index.json`, JSON.stringify(index));
    for (let start = 0; start < data.items.length; start += CHUNK_SIZE) {
      const chunk = data.items.slice(start, start + CHUNK_SIZE).map((item) => [item.path, item.previews]);
      files.set(`${slug}/chunks/${String(start / CHUNK_SIZE).padStart(3, '0')}.json`, JSON.stringify(chunk));
    }
  }
  files.set('summary.json', JSON.stringify({
    schemaVersion: 1,
    generatedAt: info.generatedAt,
    sourceRevision: info.revision,
    catalogs: Object.fromEntries(results.map(([kind, result]) => [kind.toLowerCase(), {
      items: result.data.totalItems,
      models: result.data.totalModels
    }]))
  }));
  return { files, results };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.source)) throw new Error(`INF_DATA source not found: ${options.source}`);
  const { files, results } = outputFiles(options.source);

  if (options.check) {
    const stale = [];
    for (const [name, contents] of files) {
      const outputPath = path.join(OUTPUT_DIR, name);
      if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== contents + '\n') stale.push(name);
    }
    if (fs.existsSync(OUTPUT_DIR)) {
      const visit = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? visit(fullPath) : [path.relative(OUTPUT_DIR, fullPath).replace(/\\/g, '/')];
      });
      for (const name of visit(OUTPUT_DIR)) if (!files.has(name)) stale.push(name + ' (unexpected)');
    }
    if (stale.length) {
      console.error(`Catalog output is missing or stale: ${stale.join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log('Catalog output is current.');
    }
  } else {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    for (const [name, contents] of files) {
      const outputPath = path.join(OUTPUT_DIR, name);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, contents + '\n');
    }
  }

  for (const [kind, result] of results) {
    const missingText = result.report.missing.length ? `; missing ${result.report.missing.length}` : '';
    console.log(`${kind}: ${result.report.included}/${result.report.sourceRecords} included${missingText}`);
    for (const missing of result.report.missing) console.log(`  missing: ${missing}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
