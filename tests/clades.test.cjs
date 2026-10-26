const assert=require('node:assert/strict'),Core=require('../src/core.js'),Clades=require('../src/clades.js');
const test=(name,fn)=>{fn();console.log('PASS',name);};
const make=()=>Core.parse('((A/10-25:1,B:2)95:1,(C:1,D:3)90:1);');
const style={color:'#e3b764',opacity:0.6};
function shape(root,type='rect',view=root){const scene=Core.layout(view,type),groups=Clades.prepare(scene,view);return Clades.envelopes(groups,type,{sx:1,sy:1,tx:40,ty:40},{labelWidth:n=>n.name.length*6,align:true,tipCount:scene.tips.length,trackRight:null});}
test('copy all collapsed descendants, ordered and without deduplication',()=>{
 const r=make(),n=r.children[0];n.collapsed=true;
 const metadata=n=>({label:n.name.startsWith('A/')?'Alpha':'Repeated'});
 assert.equal(Clades.labelsText(n,'ids',metadata,n=>n.name).text,'A/10-25\nB');
 assert.equal(Clades.labelsText(n,'names',metadata,n=>n.name).text,'Alpha\nRepeated');
 assert.equal(Clades.labelsText(n,'tsv',metadata,n=>n.name).text,'id\tname\nA/10-25\tAlpha\nB\tRepeated');
 assert.equal(Clades.labelsText(r.children[1],'names',metadata,n=>n.name).text,'Repeated\nRepeated');
 assert.equal(Clades.labelsText(n,'display',metadata,n=>'Shown '+n.name).text,'Shown A/10-25\nShown B');
 assert.equal(Clades.labelsText(n,'names',()=>null,n=>n.name).text,'A/10-25\nB');
});
test('copy special characters as plain text, sanitize row delimiters only',()=>{
 const r=Core.parse("('A, <tag>':1,'Bob''s':2);");
 assert.equal(Clades.labelsText(r,'names',()=>({label:'Name\twith\nline'}),n=>n.name).text,'Name with line\nName with line');
 assert.equal(Clades.labelsText(r,'ids',()=>null,n=>n.name).text,"A, <tag>\nBob's");
});
test('highlight session round trip, independent snapshot and old sessions',()=>{
 const r=make();r.children[0].highlight={...style};const snap=Core.snapshot(r);
 r.children[0].highlight.opacity=.2;assert.equal(snap.nodes[1].highlight.opacity,.6);
 const restored=Core.restore(snap);assert.deepEqual(restored.children[0].highlight,style);
 for(const n of snap.nodes)delete n.highlight;assert.equal(Core.restore(snap).children[0].highlight,null);
 snap.nodes[1].highlight={color:'url(https://bad)',opacity:.6};assert.equal(Core.restore(snap).children[0].highlight,null);
 snap.nodes[1].highlight={color:'#112233',opacity:2};assert.equal(Core.restore(snap).children[0].highlight,null);
 snap.nodes[1].highlight={color:'#112233',opacity:0};assert.equal(Core.restore(snap).children[0].highlight.opacity,0);
});
test('highlights leave Newick and RF untouched',()=>{
 const r=make(),before=Core.write(r);r.children[0].highlight={...style};
 assert.equal(Core.write(r),before);assert.equal(Core.compare(r,make()).rf,0);
});
test('multiple layout envelopes, collapse and focused ancestor highlight',()=>{
 const r=make();r.highlight={...style};r.children[0].highlight={color:'#66aaff',opacity:.4};
 for(const type of ['rect','circular','unrooted']){
  const paths=shape(r,type);assert.equal(paths.length,2);
  for(const p of paths){assert.ok(p.d.startsWith('M')&&p.d.endsWith('Z'));assert.ok(!/NaN|Infinity/.test(p.d));assert.ok(p.opacity>=0&&p.opacity<=1);}
 }
 assert.equal(shape(r,'rect',r.children[0]).length,2);
 r.collapsed=true;assert.equal(shape(r).length,1);
 r.collapsed=false;r.children[0].collapsed=true;assert.equal(shape(r).length,2);
});
test('root highlight survives rerooting without changing tip set',()=>{
 const r=make();r.highlight={...style};const orig=Core.write(r),newRoot=Core.reroot(r,r.children[0].children[0]);
 assert.equal(Core.walk(newRoot).filter(n=>n.highlight).length,1);
 assert.equal(Clades.tips(newRoot).length,4);assert.equal(Core.compare(newRoot,Core.parse(orig)).rf,0);
});
test('9223 tips copied without visible-label truncation',()=>{
 const r=Core.parse('('+Array.from({length:9223},(_,i)=>'protein_'+i+':1').join(',')+');');r.collapsed=true;
 const result=Clades.labelsText(r,'ids',()=>null,n=>n.name);assert.equal(result.count,9223);
 assert.equal(result.text.split('\n').length,9223);assert.ok(result.text.endsWith('protein_9222'));
});
console.log('7 clade tests passed');
