#!/usr/bin/env node
/**
 * bundle.mjs — re-bundle the readable source into the shipped, self-contained index.html.
 *
 * The donor (_donor/vtransect_index.html) ships a generic loader + an asset manifest
 * (Leaflet, Lucide, Inter fonts, Leaflet PNGs, all base64/gzip). None of it encodes the old
 * app's logic. So we reuse the donor verbatim and swap ONLY the JSON-encoded template:
 *
 *     index.html = donor with its <script type="__bundler/template">…</script> body
 *                  replaced by JSON.stringify( vendor_head.html + src/app.html )
 *
 * The assembled template must reference every manifest UUID (the loader resolves UUIDs to
 * blob URLs by string-replacement in the template), so we assert that before writing.
 * No npm dependencies; node + zlib only.
 */
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DONOR = path.join(ROOT, '_donor', 'vtransect_index.html');
const VENDOR_HEAD = path.join(ROOT, 'build', 'vendor_head.html');
const APP = path.join(ROOT, 'src', 'app.html');
const APP_JS = path.join(ROOT, 'src', 'app.js');
const OUT = path.join(ROOT, 'index.html');
const JS_MARKER = '<!-- @inject:js -->';

const TPL_OPEN = '<script type="__bundler/template">';
const TPL_CLOSE = '</script>';

function fail(msg) { console.error('\x1b[31m[bundle] ' + msg + '\x1b[0m'); process.exit(1); }

// ── Read inputs ──────────────────────────────────────────────────────────────
const donor = fs.readFileSync(DONOR, 'utf8');
const vendorHead = fs.readFileSync(VENDOR_HEAD, 'utf8');
let appHtml = fs.readFileSync(APP, 'utf8');
const appJs = fs.readFileSync(APP_JS, 'utf8');

// Inline the app logic at the marker (keeps src/app.js readable as its own file).
if (!appHtml.includes(JS_MARKER)) fail('src/app.html is missing the ' + JS_MARKER + ' marker');
appHtml = appHtml.replace(JS_MARKER, '<script>\n' + appJs + '\n</script>');
const template = vendorHead + appHtml;

// ── Locate the donor manifest + template block ────────────────────────────────
const manifestMatch = donor.match(/<script type="__bundler\/manifest">\s*([\s\S]*?)\s*<\/script>/);
if (!manifestMatch) fail('could not find manifest block in donor');
const manifest = JSON.parse(manifestMatch[1]);
const uuids = Object.keys(manifest);

const openIdx = donor.indexOf(TPL_OPEN);
if (openIdx === -1) fail('could not find template open tag in donor');
const bodyStart = openIdx + TPL_OPEN.length;
const closeIdx = donor.indexOf(TPL_CLOSE, bodyStart);
if (closeIdx === -1) fail('could not find template close tag in donor');

// ── Assert every manifest UUID is referenced by the assembled template ────────
const missing = uuids.filter(u => !template.includes(u));
if (missing.length) fail('assembled template is missing UUID refs (loader would mint dead blob URLs):\n  ' + missing.join('\n  '));

// ── Splice the new template in (donor loader + manifest reused verbatim) ──────
// Replace the slash in every "</" with its / JSON escape, exactly as the donor's
// bundler does. Otherwise an inner closing tag — above all the two Leaflet/Lucide vendor
// <script src> tags — would terminate the surrounding <script type="__bundler/template">
// block when a browser parses the file (HTML script-data state ends at the first literal
// </script). JSON.parse turns / back into a slash, so the decoded template is
// byte-identical to what we assembled here.
const encoded = JSON.stringify(template).replace(/<\//g, '<\\u002F');
const out = donor.slice(0, bodyStart) + '\n' + encoded + '\n  ' + donor.slice(closeIdx);
fs.writeFileSync(OUT, out);

// ── Round-trip self-test: re-extract template, decode every asset ─────────────
const check = fs.readFileSync(OUT, 'utf8');
const reOpen = check.indexOf(TPL_OPEN) + TPL_OPEN.length;
const reClose = check.indexOf(TPL_CLOSE, reOpen);
const reTemplate = JSON.parse(check.slice(reOpen, reClose).trim());
if (reTemplate !== template) fail('round-trip mismatch: re-extracted template !== assembled template');

let decoded = 0;
for (const [uuid, entry] of Object.entries(manifest)) {
  const buf = Buffer.from(entry.data, 'base64');
  if (entry.compressed) zlib.gunzipSync(buf); // throws if corrupt
  decoded++;
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('\x1b[32m[bundle] OK\x1b[0m');
console.log('  template : ' + kb(template.length) + ' (vendor_head ' + kb(vendorHead.length) + ' + app ' + kb(appHtml.length) + ')');
console.log('  assets   : ' + decoded + '/' + uuids.length + ' decoded clean');
console.log('  index.html: ' + kb(out.length) + ' -> ' + OUT);
