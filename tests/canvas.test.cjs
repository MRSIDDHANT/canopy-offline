// UI-handler integration tests with a minimal DOM and native Canvas 2D.
// This tests event logic and exports, not real browser layout or GPU drivers.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{createCanvas,Path2D}=require('@napi-rs/canvas');
const downloads=[],elements=new Map();let frame=0;const timers=new Map();let timerId=0;const copied=[];let execCopySucceeds=true;
class Element{
 constructor(id='',tag='div'){this.id=id;this.tagName=tag;this.value='';this.type='';this.checked=false;this.disabled=false;this.style={};this.children=[];this.textContent='';this.firstChild={textContent:''};this.files=[];this.hidden=false;this.attributes={};this.offsetWidth=350;this.offsetHeight=460;this.selectionStart=0;this.selectionEnd=0;}
 append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}replaceWith(n){elements.set(this.id,n);}
 click(){if(this.tagName==='a')downloads.push({name:this.download,url:this.href});else return this.onclick?.({target:this});}
 setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}focus(){this.onfocus?.();}select(){this.selectionStart=0;this.selectionEnd=this.value.length;}
 showModal(){this.open=true;}close(){this.open=false;}addEventListener(){}setPointerCapture(){}
 getBoundingClientRect(){return {width:950,height:650};}
 get selectedOptions(){return [{text:this.value}];}
}
function make(tag){if(tag==='canvas'){let c=createCanvas(950,650);c.style={};c.addEventListener=()=>{};c.setPointerCapture=()=>{};let get=c.getContext.bind(c);c.getContext=k=>k==='webgl'?null:get(k);c.replaceWith=n=>elements.set(c.id,n);c.toBlob=(cb,mime='image/png')=>cb(new Blob([c.toBuffer(mime)],{type:mime}));return c;}return new Element('',tag);}
let html=fs.readFileSync(__dirname+'/../src/shell.html','utf8');for(const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)){let e=make(m[1]);e.id=m[2];e.type=/type="([^"]+)"/.exec(m[0])?.[1]||'';e.checked=/\bchecked\b/.test(m[0]);e.value=/value="([^"]+)"/.exec(m[0])?.[1]||'';assert.ok(!elements.has(e.id),'Duplicate control ID: '+e.id);elements.set(e.id,e);}elements.get('layout').value='rect';elements.get('copyFormat').value='display';for(const [id,value] of Object.entries({bootstrapField:'0',bootstrapScale:'100',bootstrapCorner:'top-right',exportArea:'view',exportFormat:'png',exportDpi:'300',textTarget:'tips',branchScope:'branch',selectedPosition:'base',hoverPosition:'base'}))elements.get(id).value=value;
const sandbox={Path2D,navigator:{clipboard:{writeText:async text=>copied.push(text)}},console,performance,Blob,URL,Map,Set,Float32Array,Number,Object,document:{addEventListener(){},execCommand:()=>execCopySucceeds,getElementById:id=>{if(!elements.has(id))throw Error('Missing '+id);return elements.get(id)},createElement:make,createTextNode:s=>({textContent:s})},window:{},devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>{frame=fn;return 1},setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(__dirname+'/../src/core.js','utf8'),sandbox);vm.runInContext(fs.readFileSync(__dirname+'/../src/clades.js','utf8'),sandbox);vm.runInContext(fs.readFileSync(__dirname+'/../src/presentation.js','utf8'),sandbox);vm.runInContext(fs.readFileSync(__dirname+'/../src/styling.js','utf8'),sandbox);vm.runInContext(fs.readFileSync(__dirname+'/../src/extras.js','utf8'),sandbox);vm.runInContext(fs.readFileSync(__dirname+'/../src/app.js','utf8'),sandbox);
const App=sandbox.window.Canopy,Core=App.Core,$=id=>elements.get(id);function flush(){if(frame){let fn=frame;frame=0;fn();}}
(async()=>{
flush();assert.equal(sandbox.window.canopyMetrics.tips,128);assert.equal(sandbox.window.canopyMetrics.renderer,'Canvas2D');console.log('PASS fallback startup and synthetic demo');
App.loadTree('((A/1-20:1,B:2)95:3,(C:2,D:3)99:1);','test.treefile');flush();
$('annotationFile').files=[{text:async()=> 'From\tProtein names\tgroup\tvalue\theat:confidence\nA\tAlpha\tGroup A\t8\t0.8\nB\tBeta\tGroup B\t2\t0.4\n'}];await $('annotationFile').onchange({target:$('annotationFile')});await $('applyMapping').onclick();flush();assert.equal(App.session().annotations.length,2);assert.ok($('status').textContent.includes('Mapped 2 / 4'));console.log('PASS TSV accession suffix mapping, bars and heatmap');
$('search').value='Alpha';$('search').oninput();assert.equal($('results').children.length,1);$('results').children[0].click();flush();assert.ok($('nodeName').textContent.includes('Alpha'));console.log('PASS search mapped label and selection');
let internal=App.root.children[0];App.select(internal);$('collapse').click();flush();assert.equal(App.scene.tips.length,3);$('undo').click();assert.equal(App.scene.tips.length,4);App.select(App.root.children[0]);$('focus').click();flush();assert.equal(App.scene.tips.length,2);assert.equal(App.scene.nodes[0].x,0);$('whole').click();console.log('PASS collapse, undo, focus and whole-tree restore');
App.select(App.root.children[0].children[0]);await $('reroot').onclick();flush();assert.equal(Core.compare(App.root,Core.parse('((A/1-20:1,B:2)95:3,(C:2,D:3)99:1);')).rf,0);console.log('PASS reroot UI handler');
let session=App.session(),nw=Core.write(App.root);App.loadSession(JSON.parse(JSON.stringify(session)));flush();assert.equal(Core.write(App.root),nw);console.log('PASS session round trip');
for(const type of ['rect','circular','unrooted']){$('layout').value=type;$('layout').onchange();flush();assert.ok(App.scene.nodes.every(n=>Number.isFinite(n.x)));$('svg').click();$('svgFull').click();}console.log('PASS all layout handlers and SVG exports');
$('newick').click();$('renamed').click();await $('png').click();$('saveBtn').click();assert.equal(downloads.length,10);let svg=await (await fetch(downloads[0].url)).text();assert.ok(svg.includes('<svg')&&svg.includes('</svg>'));let png=Buffer.from(await(await fetch(downloads[8].url)).arrayBuffer());assert.equal(png.slice(1,4).toString(),'PNG');console.log('PASS PNG, Newick and session downloads');
App.loadTree('('+Array.from({length:9223},(_,i)=>'tip_'+i+':0.1').join(',')+');','synthetic_9223.nwk');$('layout').value='rect';$('layout').onchange();flush();assert.equal(sandbox.window.canopyMetrics.tips,9223);console.log('PASS 9223-tip Canvas 2D render, ms:',Math.round(sandbox.window.canopyMetrics.drawMs));
$('search').value='tip_9222';$('search').oninput();$('results').children[0].click();flush();assert.ok($('nodeName').textContent.includes('9222'));console.log('PASS 9223-tip search and navigation');

// New clade interactions: hover timers, pinning, clipboard and background exports.
App.loadTree('((A/1-20:1,B:2)95:3,(C:2,D:3)99:1);','clade_test.treefile');flush();
let clade=App.root.children[0];
const pointOf=n=>vm.runInContext(`point(scene.nodes.find(n=>n.id===${n.id}))`,sandbox);
let pt=pointOf(clade);$('overlay').onpointermove({offsetX:pt.x,offsetY:pt.y});
assert.equal([...timers.values()].filter(t=>t.ms===250).length,1);
for(const [id,timer]of timers)if(timer.ms===250){timers.delete(id);timer.fn();}
assert.equal($('cladePanel').hidden,false);assert.equal($('cladeText').value,'A/1-20\nB');
assert.equal($('hoverPin').getAttribute('aria-pressed'),'false');
$('hoverPin').click();assert.equal($('hoverPin').getAttribute('aria-pressed'),'true');
let cp=pointOf(App.root.children[1]);$('overlay').onpointermove({offsetX:cp.x,offsetY:cp.y});
assert.equal([...timers.values()].filter(t=>t.ms===250).length,0);
console.log('PASS hover opens complete list and Pin prevents replacement');
App.select(clade);$('copyFormat').value='ids';$('copyFormat').onchange();
await $('copyClade').onclick();assert.equal(copied.at(-1),'A/1-20\nB');assert.ok($('cladeCopyStatus').textContent.startsWith('Copied 2'));
sandbox.navigator.clipboard.writeText=async()=>{throw Error('Clipboard denied');};
execCopySucceeds=false;await $('copyClade').onclick();assert.equal($('cladeText').selectionEnd,$('cladeText').value.length);assert.ok($('cladeCopyStatus').textContent.includes('Ctrl+C'));
execCopySucceeds=true;await $('copyClade').onclick();assert.ok($('cladeCopyStatus').textContent.startsWith('Copied 2'));
$('downloadClade').click();let list=await(await fetch(downloads.at(-1).url)).text();assert.equal(list,'A/1-20\nB\n');
console.log('PASS clipboard success, denied clipboard fallback and text download');
$('hoverColor').value='#ff0000';$('hoverColor').oninput();$('hoverOpacity').value='60';$('hoverOpacity').oninput();
$('hoverHighlight').click();flush();assert.equal(clade.highlight.opacity,.6);assert.equal(clade.highlight.color,'#ff0000');
let bg=$('backgrounds').getContext('2d');let paths=vm.runInContext('highlightPaths()',sandbox);assert.equal(paths.length,1);assert.equal(paths[0].opacity,.6);
// Read an interior background pixel, far from text/edges: alpha must be 60%.
let p1=pointOf(clade), p2=pointOf(clade.children[1]);let pixel=bg.getImageData(Math.round((p1.x+p2.x)/2),Math.round(p1.y),1,1).data;
assert.equal(pixel[0],255);assert.ok(Math.abs(pixel[3]-153)<=1);
// Branch canvas stays transparent in an empty region so the background shows.
let br=$('branches').getContext('2d').getImageData(1,1,1,1).data;assert.equal(br[3],0);
$('svg').click();let highlightedSVG=await(await fetch(downloads.at(-1).url)).text();assert.ok(highlightedSVG.includes('fill-opacity="0.6"'));assert.ok(highlightedSVG.indexOf('data-clade=')<highlightedSVG.indexOf('stroke-width="1"'));
await $('png').click();let outPNG=Buffer.from(await(await fetch(downloads.at(-1).url)).arrayBuffer());const {loadImage}=require('@napi-rs/canvas');const outImg=await loadImage(outPNG);let outCanvas=createCanvas(outImg.width,outImg.height),outContext=outCanvas.getContext('2d');outContext.drawImage(outImg,0,0);let blended=outContext.getImageData(Math.round((p1.x+p2.x)/2*outImg.width/950),Math.round(p1.y*outImg.width/950),1,1).data;
assert.equal(blended[0],255);assert.ok(Math.abs(blended[1]-102)<=2);assert.equal(blended[3],255);
console.log('PASS 60% alpha background, transparent branches and SVG/PNG layering');
$('collapse').click();flush();assert.equal($('cladeText').value,'A/1-20\nB');assert.ok($('cladePanelCount').textContent.includes('2 descendant tips'));
$('collapse').click();$('focus').click();flush();assert.equal(vm.runInContext('highlightPaths().length',sandbox),1);$('whole').click();
let highlightedSession=App.session();App.loadSession(JSON.parse(JSON.stringify(highlightedSession)));flush();clade=App.root.children[0];assert.equal(clade.highlight.opacity,.6);
App.select(clade);$('clearHighlight').click();flush();assert.equal(clade.highlight,null);$('undo').click();flush();assert.equal(App.root.children[0].highlight.opacity,.6);
console.log('PASS collapsed list, focus, session persistence and undo highlight');
for(const type of ['rect','circular','unrooted']){$('layout').value=type;$('layout').onchange();flush();$('svgFull').click();let s=await(await fetch(downloads.at(-1).url)).text();assert.ok(s.includes('fill-opacity="0.6"'));assert.ok(!s.includes('NaN'));}
$('clearAllHighlights').click();flush();assert.equal(vm.runInContext('highlightPaths().length',sandbox),0);
console.log('PASS backgrounds in all layouts and clearing all');
App.loadTree('('+Array.from({length:9223},(_,i)=>'tip_'+i+':0.1').join(',')+');','synthetic_9223.nwk');$('layout').value='rect';$('layout').onchange();App.select(App.root);flush();assert.equal($('cladeText').value.split('\n').length,9223);$('highlightClade').click();flush();assert.equal(vm.runInContext('highlightPaths().length',sandbox),1);console.log('PASS 9223-tip list and highlighted Canvas 2D render, ms:',Math.round(sandbox.window.canopyMetrics.drawMs));

assert.equal(vm.runInContext('BootstrapViz.calculations',sandbox),0);console.log('PASS default load, rendering and exports never calculate bootstrap graphics');
App.loadTree('((A/1-20:1,B:2)95/80:3,(C:2,D:3)99/90:1);','publication.treefile');flush();
let tip=App.root.children[0].children[0];App.select(tip);
$('selectedName').value='Renamed <protein> & example';await $('selectedRename').click();flush();
assert.equal(tip.displayName,'Renamed <protein> & example');assert.equal(tip.name,'A/1-20');
$('labels').checked=false;$('labels').onchange();flush();assert.ok(vm.runInContext('textItems().some(t=>t.n.id===selected.id)',sandbox));
$('selectedHideName').click();flush();assert.ok(!vm.runInContext('textItems().some(t=>t.n.id===selected.id)',sandbox));
$('svgFull').click();let hiddenSVG=await(await fetch(downloads.at(-1).url)).text();assert.ok(!hiddenSVG.includes('Renamed &lt;protein&gt;'));
$('selectedShowName').click();$('svgFull').click();let renamedSVG=await(await fetch(downloads.at(-1).url)).text();assert.ok(renamedSVG.includes('Renamed &lt;protein&gt; &amp; example'));
$('renamed').click();let renamedNW=await(await fetch(downloads.at(-1).url)).text();assert.ok(renamedNW.includes('Renamed <protein> & example'));assert.ok(Core.write(App.root).includes('A/1-20'));
let editedSession=App.session();App.loadSession(JSON.parse(JSON.stringify(editedSession)));tip=App.root.children[0].children[0];assert.equal(tip.displayName,'Renamed <protein> & example');assert.equal(tip.labelVisible,true);
App.select(tip);$('selectedHideName').click();$('undo').click();assert.equal(App.root.children[0].children[0].labelVisible,true);
console.log('PASS editable names, visibility override, escaped SVG, unchanged IDs and session/undo');
let branch=App.root.children[0];App.select(branch);$('hoverName').value='Renamed clade';await $('hoverRename').click();assert.equal(branch.name,'95/80');assert.equal(branch.displayName,'Renamed clade');
$('bootstrapEnabled').checked=true;$('bootstrapEnabled').onchange();flush();assert.equal(vm.runInContext('BootstrapViz.calculations',sandbox),1);assert.equal(vm.runInContext('bootstrapCache.values.get(selected.id).fraction',sandbox),.95);
$('bootstrapField').value='1';$('bootstrapField').onchange();flush();assert.equal(vm.runInContext('bootstrapCache.values.get(selected.id).fraction',sandbox),.8);
$('svg').click();let supportSVG=await(await fetch(downloads.at(-1).url)).text();assert.ok(supportSVG.includes('data-support-circles="true"'));assert.ok(supportSVG.includes('data-support-legend="true"'));assert.ok(supportSVG.includes('Bootstrap · value 2'));
console.log('PASS opt-in bootstrap processing, second support component and legend export');
$('labels').checked=true;$('labels').onchange();$('highlightColor').value='#9bd3b5';$('highlightOpacity').value='60';$('highlightClade').click();
$('exportFormat').value='png';$('exportDpi').value='600';$('printWidth').value='8';$('exportDpi').onchange();await $('png').click();
let png600=Buffer.from(await(await fetch(downloads.at(-1).url)).arrayBuffer());assert.equal(png600.readUInt32BE(16),4800);assert.equal(png600.readUInt32BE(20),3284);
let physOffset=png600.indexOf(Buffer.from('pHYs'));assert.ok(physOffset>0);assert.equal(png600.readUInt32BE(physOffset+4),23622);assert.equal(png600[physOffset+12],1);
if(process.env.CANOPY_PREVIEW_DIR)fs.writeFileSync(require('path').join(process.env.CANOPY_PREVIEW_DIR,'canopy_600dpi_test.png'),png600);
$('exportFormat').value='jpeg';$('exportDpi').value='300';await $('png').click();let jpg300=Buffer.from(await(await fetch(downloads.at(-1).url)).arrayBuffer());let jpgImage=await loadImage(jpg300);assert.equal(jpgImage.width,2400);assert.equal(jpgImage.height,1642);assert.equal(jpg300[13],1);assert.equal(jpg300.readUInt16BE(14),300);
console.log('PASS real 600 DPI PNG (4800×3284) and 300 DPI JPEG (2400×1642), including density metadata');
const beforeDisable=vm.runInContext('BootstrapViz.calculations',sandbox);$('bootstrapEnabled').checked=false;$('bootstrapEnabled').onchange();flush();$('bootstrapField').value='0';$('bootstrapField').onchange();flush();assert.equal(vm.runInContext('BootstrapViz.calculations',sandbox),beforeDisable);
$('svg').click();let plainSVG=await(await fetch(downloads.at(-1).url)).text();assert.ok(!plainSVG.includes('data-support-circles'));assert.ok(!plainSVG.includes('data-support-legend'));
App.loadSession(JSON.parse(JSON.stringify(App.session())));flush();assert.equal($('bootstrapEnabled').checked,false);assert.equal(vm.runInContext('BootstrapViz.calculations',sandbox),beforeDisable);
console.log('PASS disabled and restored-session bootstrap graphics stay idle');
let gaugeCanvas=createCanvas(60,30),gaugeContext=gaugeCanvas.getContext('2d'),drawGauge=vm.runInContext('BootstrapViz.drawCircle',sandbox);drawGauge(gaugeContext,15,15,8,0);drawGauge(gaugeContext,45,15,8,1);assert.ok(gaugeContext.getImageData(45,15,1,1).data[0]<gaugeContext.getImageData(15,15,1,1).data[0]);console.log('PASS 100% gauge is filled, distinct from zero support');
await require('./styling.integration.cjs')({App,Core,$,sandbox,vm,flush,downloads,createCanvas,loadImage,fs});
console.log('ALL integration tests passed. Real browser/GPU not exercised.');
})().catch(e=>{console.error(e);process.exitCode=1});
