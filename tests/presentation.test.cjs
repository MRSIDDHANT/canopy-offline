const assert=require('node:assert/strict'),Core=require('../src/core.js'),{BootstrapViz,Publication}=require('../src/presentation.js');
const test=(name,fn)=>{fn();console.log('PASS',name);};
test('support calculations are idle until collect is explicitly called',()=>assert.equal(BootstrapViz.calculations,0));
test('bootstrap components, scale and malformed labels',()=>{
 const r=Core.parse('((A,B)95/80:1,(C,D)0.9/0.8:1,(E,F)named:1,(G,H)110:1);');
 let a=BootstrapViz.collect(Core.walk(r),0,100);assert.equal(a.values.size,2);assert.equal(a.skipped,2);assert.equal(a.values.get(r.children[0].id).fraction,.95);
 let b=BootstrapViz.collect(Core.walk(r),1,100);assert.equal(b.values.get(r.children[0].id).fraction,.8);
 let c=BootstrapViz.collect(Core.walk(r),0,1);assert.equal(c.values.size,1);assert.equal(c.values.get(r.children[1].id).fraction,.9);
 r.children[0].displayName='Edited clade';assert.equal(BootstrapViz.collect(Core.walk(r)).values.get(r.children[0].id).value,95);
});
test('zero and full-circle SVG geometry',()=>{assert.equal(BootstrapViz.piePath(10,10,6,0),'');assert.ok(BootstrapViz.piePath(10,10,6,1).includes('A6 6'));assert.ok(!BootstrapViz.svgCircle(10,10,6,.5).includes('NaN'));});
test('print width and DPI determine real pixel count',()=>{
 for(const dpi of [300,600,1200]){let p=Publication.dimensions(1000,500,8,dpi);assert.equal(p.width,8*dpi);assert.equal(p.height,4*dpi);assert.equal(p.heightInches,4);}
 assert.throws(()=>Publication.dimensions(1000,100000,8,600),/export limit/);
 for(const bad of [0,-1,Infinity,72.5,2401])assert.throws(()=>Publication.dimensions(1000,500,8,bad));
});
function chunks(b){let a=[],p=8;while(p<b.length){let n=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8);a.push({type,data:b.subarray(p+8,p+8+n)});p+=n+12;}return a;}
test('PNG resolution metadata is written and replaced without duplicate chunks',()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZf8AAAAASUVORK5CYII=','base64');
 const at300=Buffer.from(Publication.pngDpi(png,300)),at600=Buffer.from(Publication.pngDpi(at300,600));let parsed=chunks(at600);assert.equal(parsed.filter(x=>x.type==='pHYs').length,1);let phys=parsed.find(x=>x.type==='pHYs').data;assert.equal(phys.readUInt32BE(0),23622);assert.equal(phys.readUInt32BE(4),23622);assert.equal(phys[8],1);
 assert.deepEqual(parsed.find(x=>x.type==='IDAT').data,chunks(png).find(x=>x.type==='IDAT').data);
 assert.throws(()=>Publication.pngDpi(Buffer.alloc(8),300));
});
test('JPEG JFIF density uses inches and keeps only one JFIF marker',()=>{
 let image=Uint8Array.from([255,216,255,217]),at300=Publication.jpegDpi(image,300),at600=Publication.jpegDpi(at300,600),b=Buffer.from(at600);
 assert.equal(b.toString('ascii',6,11),'JFIF\0');assert.equal(b[13],1);assert.equal(b.readUInt16BE(14),600);assert.equal(b.readUInt16BE(16),600);assert.equal(b.length,22);
 assert.throws(()=>Publication.jpegDpi(Uint8Array.from([0,1]),300));
});
test('custom names and visibility survive sessions without changing raw labels',()=>{
 let r=Core.parse('((A:1,B:1)95:1,C:2);'),raw=Core.write(r);r.children[0].displayName='Renamed clade';r.children[0].labelVisible=false;r.children[0].children[0].displayName='Protein A';r.children[0].children[0].labelVisible=true;
 let restored=Core.restore(Core.snapshot(r));assert.equal(restored.children[0].displayName,'Renamed clade');assert.equal(restored.children[0].labelVisible,false);assert.equal(restored.children[0].children[0].labelVisible,true);assert.equal(Core.write(restored),raw);
 let old=Core.snapshot(r);for(const n of old.nodes){delete n.displayName;delete n.labelVisible;}assert.equal(Core.restore(old).children[0].displayName,null);
});
console.log('7 presentation tests passed');
