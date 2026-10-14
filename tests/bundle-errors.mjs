import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../_donor/vtransect_index.html', import.meta.url), 'utf8');
const elements = new Map();
function element() {
 const node = { style: {}, children: [], appendChild(child) { this.children.push(child); return child; }, remove() { elements.delete(this.id); this.children.forEach(c => elements.delete(c.id)); } };
 Object.defineProperty(node, 'id', { get() { return this._id; }, set(v) { this._id=v; elements.set(v, this); } });
 return node;
}
let handler, capture;
const context = { document: { body: element(), createElement: element, getElementById: id => elements.get(id) }, window: { addEventListener(type, callback, useCapture) { handler=callback; capture=useCapture; } } };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  // Resource errors'), source.indexOf('\n  try {')), context);
assert.equal(capture, undefined);
for(let i=0;i<100;i++) handler({ type:'error', target:{tagName:'IMG'} });
assert.equal(elements.has('__bundler_err'),false);
handler({message:'Example runtime error', filename:'app.js',lineno:3});
assert.match(elements.get('__bundler_err_details').textContent,/Example runtime error.*app.js:3/);
handler({message:'Example runtime error', filename:'app.js',lineno:3});
assert.equal(elements.get('__bundler_err_details').textContent.split('\n').length,1);
for(let i=0;i<20;i++)handler({message:'Error '+i});
assert.equal(elements.get('__bundler_err_details').textContent.split('\n').length,5);
elements.get('__bundler_err').children[0].onclick();
assert.equal(elements.has('__bundler_err'),false);
console.log('Tile/resource failures ignored; runtime failures retained, deduplicated, bounded and dismissible.');
