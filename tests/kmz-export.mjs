import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const sandbox = { TextEncoder, Uint8Array, DataView, nowISO: () => '', r3: n => +n.toFixed(3),
 state: { outFmt: 'kmz', shared: { home: { lat: 58, lon: 5 } } }, loc: (lat, lon, alt) => ({lat,lon,alt}), clone: x => structuredClone(x) };
vm.createContext(sandbox);
vm.runInContext(source.slice(source.indexOf('function toAirHub'), source.indexOf('function dlBlob')), sandbox);
const wps = [130, 140].map((alt, i) => ({ location: {lat:59 + i / 100,lon:6,alt}, waypointType:'waypoint', headingMode:'towardPOI', poiCoordinate:{lat:60,lon:7}, speed:3, actions:[{type:'gimbalRotate',parameters:{gimbalRotate:{pitch:-30}}},{type:'takePhoto'}] }));
assert.equal(sandbox.buildOutput(wps, {ground:100,speed:3}).files, null);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wpml-test-'));
try {
 for (const [model, drone, sub, payload] of [['m4td',100,1,99],['m30t',67,1,53],['m350',89,0,83],['m400',103,0,83]]) {
  Object.assign(sandbox.djiSettings(),{model,payload:'83',position:'0'});
  const out = sandbox.buildOutput(wps,{ground:100,speed:3,camera:{lens:'infrared'}});
  assert.equal(out.files.length,2);
  assert.equal(out.ext,'kmz');
  fs.writeFileSync(path.join(temp,model+'.kmz'),sandbox.toKMZ(out.files));
 }
 fs.writeFileSync(path.join(temp,'unicode.kmz'),sandbox.toKMZ([{name:'æ.kml',content:'Æøå 🚁'},{name:'empty',content:''}]));
 execFileSync('python',['-c',`import pathlib,sys,zipfile,xml.etree.ElementTree as ET
p=pathlib.Path(sys.argv[1]); ns={'k':'http://www.opengis.net/kml/2.2','w':'http://www.dji.com/wpmz/1.0.2'}
for model,drone,sub,payload in [('m4td',100,1,99),('m30t',67,1,53),('m350',89,0,83),('m400',103,0,83)]:
 with zipfile.ZipFile(p/(model+'.kmz')) as z:
  assert z.namelist()==['wpmz/template.kml','wpmz/waylines.wpml']
  assert z.testzip() is None
  for name in z.namelist():
   root=ET.fromstring(z.read(name))
   def text(key): return root.find('.//w:'+key,ns).text
   assert int(text('droneEnumValue'))==drone
   assert int(text('droneSubEnumValue'))==sub
   assert int(text('payloadEnumValue'))==payload
   pts=root.findall('.//k:Placemark',ns); assert len(pts)==2
   for i,pt in enumerate(pts):
    assert pt.find('w:index',ns).text==str(i)
    key='height' if name.endswith('template.kml') else 'executeHeight'
    assert float(pt.find('w:'+key,ns).text)==30+i*10
    assert pt.find('.//w:waypointPoiPoint',ns).text=='60,7,0'
    assert pt.find('.//w:gimbalPitchRotateAngle',ns).text=='-30'
    assert [a.text for a in pt.findall('.//w:actionActuatorFunc',ns)]==['gimbalRotate','takePhoto']
   assert text('finishAction')=='goHome'
   if name.endswith('wpml'): assert text('executeHeightMode')=='relativeToStartPoint'
with zipfile.ZipFile(p/'unicode.kmz') as z:
 assert z.testzip() is None
 assert z.read('æ.kml').decode()=='Æøå 🚁'
 assert z.read('empty')==b''
`,temp]);
 const fixed={...wps[0],headingMode:'fixed',actions:[{type:'rotateYaw',parameters:{rotateYaw:{aircraftHeading:270}}}]};
 assert.match(sandbox.toDJIFiles([fixed],{ground:100,speed:3})[1].content,/<wpml:waypointHeadingAngle>-90<\/wpml:waypointHeadingAngle>/);
 sandbox.state.outFmt='kml'; assert.equal((sandbox.buildOutput(wps,{ground:100,speed:3}).content.match(/<Point>/g)||[]).length,4);
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
console.log('Four DJI profiles, ZIP paths/CRC/UTF-8, XML, indices, POI, relative heights, camera actions and KML regression passed.');
