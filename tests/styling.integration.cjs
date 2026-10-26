// Runs inside the native Canvas / simulated DOM harness in canvas.test.cjs.
module.exports=async function({App,Core,$,sandbox,vm,flush,downloads,createCanvas,loadImage,fs}){
 const assert=require('node:assert/strict'),read=code=>vm.runInContext(code,sandbox),plain=value=>JSON.parse(JSON.stringify(value));
 const setStyle=(prefix,{family='Arial',size=16,color='#264d3f',bold=false,italic=false}={})=>{
  $(prefix+'Font').value=family;$(prefix+'Size').value=String(size);$(prefix+'TextColor').value=color;$(prefix+'Bold').checked=bold;$(prefix+'Italic').checked=italic;
 };
 const source='((A:9,(B:4,C:8)85:4)95:2,D:1);';
 App.loadTree(source,'style_test.nwk');$('layout').value='rect';$('layout').onchange();$('labels').checked=true;$('supports').checked=false;flush();
 let node=App.root.children[0],longest=node.children[1].children[1];App.select(node);
 $('selectedName').value='Example clade';await $('selectedRename').click();
 setStyle('selected',{family:'Times New Roman',size:24,color:'#702e8b',bold:true,italic:true});$('selectedPosition').value='tip';await $('selectedApplyStyle').click();flush();
 assert.equal(node.labelPosition,'tip');assert.equal(node.labelStyle.family,'Times New Roman');assert.equal(Core.write(App.root),source);
 for(const layout of ['rect','circular','unrooted']){
  $('layout').value=layout;$('layout').onchange();flush();
  assert.equal(read('longestEndpoints.get(selected).name'),'C');
  const item=read('textItems(cam,W,H,true).find(t=>t.n===selected)'),p=read('point(longestEndpoints.get(selected))');
  assert.ok(item.x>p.x+9);assert.equal(item.y,p.y);assert.equal(item.style.size,24);
  $('svgFull').click();const svg=await(await fetch(downloads.at(-1).url)).text();
  assert.match(svg,/<text[^>]+font-family="&quot;Times New Roman&quot;, serif"[^>]+font-size="24"[^>]+font-weight="bold"[^>]+font-style="italic"[^>]+fill="#702e8b"[^>]*>Example clade<\/text>/);
 }
 $('layout').value='rect';$('layout').onchange();$('hoverPosition').value='base';await $('hoverApplyStyle').click();flush();
 assert.equal(node.labelPosition,'base');assert.equal(read('nodeNamePoint(selected).x'),read('point(selected).x')+3);
 $('selectedPosition').value='tip';await $('selectedApplyStyle').click();$('collapse').click();flush();assert.equal(read('longestEndpoints.get(selected).id'),node.id);$('collapse').click();flush();
 console.log('PASS longest cumulative path / base placement, all layouts, collapse, and styled SVG labels');

 const textColour=read('nodeTextStyle(selected).color');
 $('branchScope').value='branch';$('branchScope').onchange();$('branchColor').value='#f02020';await $('applyBranchColor').click();
 assert.equal(node.color,'#f02020');assert.equal(node.children[0].color,null);assert.equal(App.root.children[1].color,null);assert.equal(read('nodeTextStyle(selected).color'),textColour);
 $('branchScope').value='clade';$('branchColor').value='#2060ef';await $('applyBranchColor').click();assert.ok(Core.walk(node).every(n=>n.color==='#2060ef'));assert.equal(App.root.children[1].color,null);
 $('branchScope').value='all';$('branchColor').value='#164d30';await $('applyBranchColor').click();assert.ok(Core.walk(App.root).every(n=>n.color===null));assert.equal(App.session().appearance.branchColor,'#164d30');
 $('branchScope').value='branch';$('branchColor').value='#f02020';await $('applyBranchColor').click();assert.equal(read('colorOf(selected)'),'#f02020');assert.equal(read('colorOf(root.children[1])'),'#164d30');
 $('resetBranchColor').click();assert.equal(read('colorOf(selected)'),'#164d30');$('undo').click();flush();node=App.root.children[0];assert.equal(node.color,'#f02020');
 console.log('PASS one-branch, clade and whole-tree colours, independent typography, reset and undo');

 const before=read('BootstrapViz.calculations');
 for(const [category,family,size,color] of [['tips','Calibri',16,'#163ea0'],['nodes','Times New Roman',18,'#692f87'],['legend','Helvetica',14,'#5c357e'],['scale','Arial',15,'#a33522'],['boxes','Arial',22,'#273b50']]){
  $('textTarget').value=category;$('textTarget').onchange();setStyle('global',{family,size,color,bold:true,italic:true});await $('applyGlobalStyle').click();
  assert.equal(App.session().appearance.text[category].family,family);
 }
 flush();assert.equal(read('BootstrapViz.calculations'),before);assert.equal(read('nodeTextStyle(root.children[0]).size'),24);
 $('bootstrapEnabled').checked=true;$('bootstrapEnabled').onchange();flush();$('svg').click();let svg=await(await fetch(downloads.at(-1).url)).text();
 const legend=svg.match(/<g data-support-legend="true">([\s\S]*?)<\/g>/)[1];assert.match(legend,/font-family="&quot;Helvetica&quot;, sans-serif" font-size="14" font-weight="bold" font-style="italic" fill="#5c357e"/);
 assert.match(svg,/<text[^>]+font-size="15"[^>]+fill="#a33522"[^>]*>.*subst\/site<\/text>/);
 console.log('PASS four fonts, category defaults, individual overrides, styled legend and scale bar');

 await $('addTextbox').click();$('textboxText').value='Tree title <&>\nSecond line';setStyle('textbox',{family:'Times New Roman',size:28,color:'#b32648',bold:true,italic:true});await $('applyTextbox').click();flush();
 let box=read('selectedTextBox()'),item=read('textBoxItems()[0]');assert.equal(box.text,'Tree title <&>\nSecond line');assert.equal(box.style.size,28);
 const old=plain(box.positions.rect),camera=plain(read('cam'));const start={offsetX:item.x+10,offsetY:item.y+10,pointerId:1,button:0};
 $('overlay').onpointerdown(start);$('overlay').onpointermove({...start,offsetX:start.offsetX+80,offsetY:start.offsetY+35});$('overlay').onpointerup({...start,offsetX:start.offsetX+80,offsetY:start.offsetY+35});flush();
 assert.deepEqual(plain(read('cam')),camera);assert.ok(Math.abs(box.positions.rect.x-old.x-80/camera.sx)<1e-8);assert.ok(Math.abs(box.positions.rect.y-old.y-35/camera.sy)<1e-8);
 $('undo').click();flush();assert.deepEqual(plain(read('selectedTextBox().positions.rect')),old);
 $('overlay').onkeydown({key:'ArrowRight',shiftKey:true,preventDefault(){}});flush();assert.ok(Math.abs(read('selectedTextBox().positions.rect.x')-old.x-10/camera.sx)<1e-8);
 const saved=plain(App.session());App.loadSession(saved);flush();assert.equal(App.session().textBoxes[0].text,box.text);assert.equal(App.root.children[0].labelPosition,'tip');assert.equal(App.root.children[0].labelStyle.size,24);assert.equal(App.session().appearance.branchColor,'#164d30');
 assert.equal($('bootstrapEnabled').checked,false);
 $('textboxList').value=String(saved.textBoxes[0].id);$('textboxList').onchange();
 $('layout').value='circular';$('layout').onchange();flush();let citem=read('textBoxItems()[0]');assert.ok(Number.isFinite(citem.x));
 const event={offsetX:citem.x+10,offsetY:citem.y+10,pointerId:2};$('overlay').onpointerdown(event);$('overlay').onpointermove({...event,offsetX:event.offsetX+40});$('overlay').onpointerup({...event,offsetX:event.offsetX+40});flush();assert.ok(App.session().textBoxes[0].positions.circular);
 $('layout').value='rect';$('layout').onchange();flush();assert.deepEqual(plain(App.session().textBoxes[0].positions.rect),saved.textBoxes[0].positions.rect);
 console.log('PASS multiline textbox editing, drag without panning, keyboard nudge, layout positions and session/undo');

 // An annotation beyond the viewport must be included in full exports.
 read('moveTextBox(selectedTextBox(), -700, -450)');flush();
 const bounds=read('exportFrame(true)'),exportBox=read('textBoxItems(exportFrame(true).c)[0]');
 assert.ok(exportBox.x>=20&&exportBox.y>=20);assert.ok(exportBox.x+exportBox.w<bounds.w);assert.ok(exportBox.y+exportBox.h<bounds.h);
 $('svgFull').click();svg=await(await fetch(downloads.at(-1).url)).text();assert.ok(svg.includes('Tree title &lt;&amp;&gt;'));assert.ok(svg.includes('Second line'));assert.ok(svg.includes('data-textbox='));assert.ok(svg.includes('xml:space="preserve"'));assert.ok(!svg.includes('stroke-dasharray'));
 assert.match(svg,/<text[^>]+font-family="&quot;Times New Roman&quot;, serif"[^>]+font-size="28"[^>]+font-weight="bold"[^>]+font-style="italic"[^>]+fill="#b32648"[^>]*>Tree title &lt;&amp;&gt;<\/text>/);
 // Native Canvas pixels confirm coloured text makes it into the raster image.
 $('exportArea').value='full';$('exportDpi').value='600';$('exportFormat').value='png';$('printWidth').value='8';await $('png').click();
 const png=Buffer.from(await(await fetch(downloads.at(-1).url)).arrayBuffer());assert.equal(png.readUInt32BE(16),4800);assert.equal(png.readUInt32BE(png.indexOf(Buffer.from('pHYs'))+4),23622);
 const img=await loadImage(png),canvas=createCanvas(img.width,img.height),context=canvas.getContext('2d');context.drawImage(img,0,0);
 const scale=img.width/bounds.w,pixels=context.getImageData(Math.floor(exportBox.x*scale),Math.floor(exportBox.y*scale),Math.ceil(exportBox.w*scale),Math.ceil(exportBox.h*scale)).data;
 let coloured=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>150&&pixels[i]<210&&pixels[i+1]<80&&pixels[i+2]<110)coloured++;assert.ok(coloured>100);
 if(process.env.CANOPY_PREVIEW_DIR)fs.writeFileSync(require('path').join(process.env.CANOPY_PREVIEW_DIR,'canopy_styled_600dpi.png'),png);
 console.log('PASS full SVG / 600 DPI raster includes offscreen textboxes, escaped text, styled raster pixels and DPI metadata');

 const copied=plain(App.session());copied.tree.nodes[0].labelStyle={family:'<script>',size:Infinity,color:'red',bold:true};
 copied.textBoxes[0].style={family:'Arial',size:21,color:'#123abc',italic:true};App.loadSession(copied);flush();assert.deepEqual(plain(App.root.labelStyle),{bold:true});
 const invalid=plain(App.session());invalid.textBoxes.push(invalid.textBoxes[0]);assert.throws(()=>App.loadSession(invalid),/Invalid session textbox/);assert.equal(App.session().textBoxes.length,1);
 $('textTarget').value='all';setStyle('global',{family:'Arial',size:20,color:'#372914',bold:false,italic:true});await $('applyGlobalStyle').click();flush();assert.ok(Core.walk(App.root).every(n=>n.labelStyle===null));assert.equal(App.session().textBoxes[0].style,null);assert.ok(Object.values(App.session().appearance.text).every(s=>s.size===20));
 $('textboxList').value=String(App.session().textBoxes[0].id);$('textboxList').onchange();$('removeTextbox').click();assert.equal(App.session().textBoxes.length,0);$('undo').click();assert.equal(App.session().textBoxes.length,1);
 const legacy=plain(App.session());delete legacy.textBoxes;delete legacy.appearance;for(const n of legacy.tree.nodes){delete n.labelStyle;delete n.labelPosition;}App.loadSession(legacy);flush();assert.equal(App.session().textBoxes.length,0);assert.equal(App.root.labelPosition,'base');assert.equal(App.session().appearance.text.tips.family,'Arial');
 console.log('PASS old-session compatibility, style validation, global override, and textbox removal/undo');
};
