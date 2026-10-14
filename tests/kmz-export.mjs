import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const exportsCode = source.slice(source.indexOf('function toAirHub'), source.indexOf('function dlBlob'));
const sandbox = { TextEncoder, Uint8Array, DataView, nowISO: () => '2026-10-14T00:00:00Z',
  state: { outFmt: 'kmz', shared: { home: { lat: 58.9, lon: 5.7 } } },
  loc: (lat, lon, alt) => ({ lat, lon, alt }), clone: x => structuredClone(x) };
vm.createContext(sandbox);
vm.runInContext(exportsCode, sandbox);
const wps = [10, 20].map(alt => ({ location: { lat: 59, lon: 6, alt }, waypointType: 'waypoint', speed: 3, actions: [] }));
const out = sandbox.buildOutput(wps, { ground: 0, speed: 3 });
assert.equal(out.ext, 'kmz');
assert.equal(out.mime, 'application/vnd.google-earth.kmz');
assert.equal((out.content.match(/<Point>/g) || []).length, 4);
assert.match(out.content, /6,59,10 6,59,20/);
sandbox.state.outFmt = 'kml';
assert.equal(out.content, sandbox.buildOutput(wps, { ground: 0, speed: 3 }).content);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kmz-test-'));
try {
  for (const [name, kml] of [['mission', out.content], ['unicode', '<kml>Æøå 🚁</kml>'], ['empty', '']]) {
    fs.writeFileSync(path.join(temp, name + '.kmz'), sandbox.toKMZ(kml));
    fs.writeFileSync(path.join(temp, name + '.kml'), kml);
  }
  execFileSync('python', ['-c', `import pathlib, sys, zipfile, xml.etree.ElementTree as ET
p = pathlib.Path(sys.argv[1])
for name in ('mission', 'unicode', 'empty'):
    with zipfile.ZipFile(p / (name + '.kmz')) as z:
        assert z.namelist() == ['doc.kml']
        assert z.testzip() is None
        assert z.read('doc.kml') == (p / (name + '.kml')).read_bytes()
with zipfile.ZipFile(p / 'mission.kmz') as z:
    root = ET.fromstring(z.read('doc.kml'))
    ns = {'k': 'http://www.opengis.net/kml/2.2'}
    assert len(root.findall('.//k:Point', ns)) == 4
    assert len(root.findall('.//k:LineString', ns)) == 1
`, temp]);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('KMZ archive, CRC, UTF-8, KML XML, waypoint order and home points passed.');
