/* Tree typography, branch colours, and movable text annotations. */
'use strict';
const textDefaults = {
 tips:{family:'Arial',size:11,bold:false,italic:false,color:'#274e3c'},
 nodes:{family:'Arial',size:10,bold:false,italic:false,color:'#8a6443'},
 legend:{family:'Arial',size:10,bold:false,italic:false,color:'#476752'},
 scale:{family:'Arial',size:10,bold:false,italic:false,color:'#5a7464'},
 boxes:{family:'Arial',size:18,bold:false,italic:false,color:'#274e3c'}
};
let appearance=defaultAppearance(),textBoxes=[],selectedTextBoxId=null,longestEndpoints=new Map();
function defaultAppearance(){return {branchColor:null,text:Object.fromEntries(Object.entries(textDefaults).map(([key,value])=>[key,{...value}]))};}
function cleanAppearance(value){
 const result=defaultAppearance();
 if(validColor(value?.branchColor))result.branchColor=value.branchColor;
 for(const key of Object.keys(textDefaults))Object.assign(result.text[key],Core.cleanTextStyle(value?.text?.[key])||{});
 return result;
}
function cleanTextBoxes(items){
 if(items==null)return [];
 if(!Array.isArray(items)||items.length>200)throw Error('A session can contain up to 200 textboxes.');
 const ids=new Set();
 return items.map(box=>{
  if(!box||!Number.isSafeInteger(box.id)||box.id<0||ids.has(box.id)||typeof box.text!=='string'||box.text.length>4000||box.text.split('\n').length>100)throw Error('Invalid session textbox.');
  ids.add(box.id);const positions={};
  for(const type of ['rect','circular','unrooted']){
   const p=box.positions?.[type];if(p&&[p.x,p.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9))positions[type]={x:p.x,y:p.y};
  }
  return {id:box.id,text:box.text,positions,style:Core.cleanTextStyle(box.style)};
 });
}
function decorationSnapshot(){return JSON.parse(JSON.stringify({appearance,textBoxes}));}
function restoreDecorations(value){
 const nextAppearance=cleanAppearance(value?.appearance),nextBoxes=cleanTextBoxes(value?.textBoxes);
 appearance=nextAppearance;textBoxes=nextBoxes;selectedTextBoxId=null;
 refreshGlobalStyle();refreshTextBoxEditor();refreshBranchEditor();styleAnnotationLegend();
}
function fontStack(style){return '"'+style.family+'", '+(style.family==='Times New Roman'?'serif':'sans-serif');}
function canvasFont(style){return (style.italic?'italic ':'')+(style.bold?'bold ':'')+style.size+'px '+fontStack(style);}
function svgTextStyle(style){return `font-family="${esc(fontStack(style))}" font-size="${style.size}" font-weight="${style.bold?'bold':'normal'}" font-style="${style.italic?'italic':'normal'}" fill="${style.color}"`;}
function nodeTextStyle(n){return {...appearance.text[n.children.length?'nodes':'tips'],...(n.labelStyle||{})};}
function textBoxStyle(box){return {...appearance.text.boxes,...(box.style||{})};}
function measureText(text,style){ctx.font=canvasFont(style);return ctx.measureText(text).width;}
function drawText(context,text,x,y,style,align='left'){
 context.font=canvasFont(style);context.fillStyle=style.color;context.textBaseline='middle';context.textAlign=align;context.fillText(text,x,y);
}
function svgText(text,x,y,style,extra=''){return `<text x="${x}" y="${y}" dominant-baseline="middle" ${svgTextStyle(style)} ${extra}>${esc(text)}</text>`;}
function prepareLabelAnchors(){
 longestEndpoints=new Map();
 // One bottom-up pass; no descendant traversal during each render.
 for(let i=scene.nodes.length-1;i>=0;i--){
  const n=scene.nodes[i];let endpoint=n;
  if(n.children.length&&!n.collapsed)for(const child of n.children){const tip=longestEndpoints.get(child);if(tip&&(endpoint===n||tip.dist>endpoint.dist))endpoint=tip;}
  longestEndpoints.set(n,endpoint);
 }
}
function nodeNamePoint(n,c=cam){
 const target=n.labelPosition==='tip'?(longestEndpoints.get(n)||n):n,p=point(target,c),style=nodeTextStyle(n);
 if(!n.children.length||n.collapsed){if($('layout').value==='rect'&&$('align').checked)p.x=1000*c.sx+c.tx;return {x:p.x+9,y:p.y};}
 if(n.labelPosition==='tip'){
  let x=p.x+9;
  // Place the clade name beyond an existing tip label, rather than on top of
  // that label or a neighbouring row. No offset is needed when it is hidden.
  if(target!==n&&isNameVisible(target)){
   const tipPoint=nodeNamePoint(target,c),tipStyle=nodeTextStyle(target),tipText=exportLabel({text:label(target),style:tipStyle,support:false});
   x=Math.max(x,tipPoint.x+measureText(tipText,tipStyle)+14);
  }
  return {x,y:p.y};
 }
 return {x:p.x+3,y:p.y-style.size/2-5};
}
function readableRowGap(){let gap=18;for(const n of scene.nodes)if(isNameVisible(n))gap=Math.max(gap,nodeTextStyle(n).size*1.35+6);return gap;}
function fillStyleEditor(prefix,style){
 $(prefix+'Font').value=style.family;$(prefix+'Size').value=style.size;$(prefix+'TextColor').value=style.color;
 $(prefix+'Bold').checked=style.bold;$(prefix+'Italic').checked=style.italic;
}
function readStyleEditor(prefix){
 const size=Number($(prefix+'Size').value),family=$(prefix+'Font').value,color=$(prefix+'TextColor').value;
 if(!Core.fonts.includes(family)||!Number.isFinite(size)||size<6||size>96||!validColor(color))throw Error('Choose a font, a size from 6 to 96, and a text colour.');
 return {family,size,color,bold:$(prefix+'Bold').checked,italic:$(prefix+'Italic').checked};
}
function refreshNodeStyle(prefix,n){
 for(const suffix of ['Font','Size','TextColor','Bold','Italic','Position','ApplyStyle','ResetStyle'])$(prefix+suffix).disabled=!n;
 fillStyleEditor(prefix,n?nodeTextStyle(n):appearance.text.nodes);$(prefix+'Position').value=n?.labelPosition||'base';
}
function changeNodeStyle(n,prefix,reset=false){
 if(!n)return;const style=reset?null:readStyleEditor(prefix),position=reset?'base':$(prefix+'Position').value;
 remember();n.labelStyle=style;n.labelPosition=position==='tip'?'tip':'base';
 updateInspector();refreshCladePanel();drawSoon();updateExportPreview();
 message(reset?'Node text uses the global style and base position.':'Node text style and position updated.');
}
function refreshGlobalStyle(){const key=$('textTarget').value;fillStyleEditor('global',appearance.text[key]||appearance.text.tips);}
function changeGlobalStyle(){
 const style=readStyleEditor('global'),key=$('textTarget').value;remember();
 if(key==='all'){
  for(const target of Object.keys(appearance.text))appearance.text[target]={...style};
  for(const n of Core.walk(root))n.labelStyle=null;
  for(const box of textBoxes)box.style=null;
 }else if(Object.hasOwn(appearance.text,key))appearance.text[key]={...style};
 updateInspector();refreshCladePanel();refreshTextBoxEditor();styleAnnotationLegend();drawSoon();updateExportPreview();
 message(key==='all'?'Style applied to all tree text, including individual labels and textboxes.':'Global text style updated. Individually styled labels keep their overrides.');
}
function styleAnnotationLegend(){
 const style=appearance.text.legend,legend=$('legend');
 legend.style.font=canvasFont(style);legend.style.color=style.color;
 for(const child of legend.children){child.style.font='inherit';child.style.color='inherit';}
}
function refreshBranchEditor(){
 const scope=$('branchScope').value,enabled=scope==='all'||!!selected&&(scope==='clade'||!!selected.parent);
 $('applyBranchColor').disabled=!enabled;$('resetBranchColor').disabled=!enabled;
 $('branchTarget').textContent=scope==='all'?'All branches':selected?(scope==='clade'?'Selected node and descendants':'Incoming branch of selected node'):'Select a node on the tree first.';
}
function changeBranchColor(reset=false){
 const scope=$('branchScope').value,value=$('branchColor').value;
 if(scope!=='all'&&(!selected||(scope==='branch'&&!selected.parent)))return;
 if(!reset&&!validColor(value))throw Error('Choose a branch colour.');
 remember();
 if(scope==='all'){appearance.branchColor=reset?null:value;for(const n of Core.walk(root))n.color=null;}
 else for(const n of scope==='clade'?Core.walk(selected):[selected])n.color=reset?null:value;
 uploadGeometry();drawSoon();message(reset?'Branch colours restored to inherited or annotation colours.':'Branch colour updated. Text colours are controlled separately.');
}
function selectedTextBox(){return textBoxes.find(box=>box.id===selectedTextBoxId)||null;}
function refreshTextBoxEditor(){
 const list=$('textboxList');list.replaceChildren();
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=textBoxes.length?'Select a textbox…':'No textboxes yet';list.append(placeholder);
 for(const box of textBoxes){const option=document.createElement('option');option.value=box.id;option.textContent=box.text.split('\n')[0].slice(0,50)||'Empty textbox';list.append(option);}
 const box=selectedTextBox();list.value=box?String(box.id):'';$('textboxEditor').hidden=!box;
 if(box){$('textboxText').value=box.text;fillStyleEditor('textbox',textBoxStyle(box));}
 $('textboxStatus').textContent=box?'Drag the box to move it. Apply changes to save text and style.':'Add a textbox, or click one on the tree to edit it.';
}
function selectTextBox(box,focus=false){
 selectedTextBoxId=box?.id??null;
 if(box){selected=null;closeCladePanel();updateInspector();}
 refreshTextBoxEditor();drawSoon();
 if(focus&&box){$('textboxEditor').scrollIntoView?.({block:'nearest'});$('textboxText').focus();$('textboxText').select();}
}
function addTextBox(){
 if(textBoxes.length>=200)throw Error('The tree already has 200 textboxes. Remove one before adding another.');
 remember();const offset=(textBoxes.length%6)*16;
 const box={id:textBoxes.reduce((max,b)=>Math.max(max,b.id),0)+1,text:'Text box',style:null,positions:{[$('layout').value]:{x:(W/2+offset-cam.tx)/cam.sx,y:(H/2+offset-cam.ty)/cam.sy}}};
 textBoxes.push(box);selectTextBox(box,true);updateExportPreview();message('Textbox added. Edit its text on the left, apply changes, then drag it into place.');
}
function editTextBox(){
 const box=selectedTextBox();if(!box)return;
 const text=$('textboxText').value.replace(/\r\n?/g,'\n'),style=readStyleEditor('textbox');
 if(!text.trim()||text.length>4000||text.split('\n').length>100)throw Error('Enter 1–4,000 characters, with at most 100 lines.');
 remember();box.text=text;box.style=style;refreshTextBoxEditor();drawSoon();updateExportPreview();message('Textbox updated.');
}
function removeTextBox(){const box=selectedTextBox();if(!box)return;remember();textBoxes=textBoxes.filter(b=>b!==box);selectTextBox(null);updateExportPreview();message('Textbox removed.');}
function boxWorldPosition(box){
 const position=box.positions[$('layout').value];if(position)return position;
 // Each layout remembers its own positions. Until moved in a new layout,
 // place the annotation at the middle of that layout's tree bounds.
 let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
 for(const n of scene.nodes){minx=Math.min(minx,n.x);miny=Math.min(miny,n.y);maxx=Math.max(maxx,n.x);maxy=Math.max(maxy,n.y);}
 return {x:(minx+maxx)/2,y:(miny+maxy)/2+(box.id%6)*16};
}
function textBoxItems(c=cam){
 return textBoxes.map(box=>{
  const p=boxWorldPosition(box),style=textBoxStyle(box),lines=box.text.split('\n'),lineHeight=style.size*1.35;
  const width=Math.max(style.size,...lines.map(line=>measureText(line,style))),height=lines.length*lineHeight;
  return {box,x:p.x*c.sx+c.tx,y:p.y*c.sy+c.ty,w:width,h:height,style,lines,lineHeight};
 });
}
function textBoxAt(x,y){const items=textBoxItems();for(let i=items.length-1;i>=0;i--){const item=items[i];if(x>=item.x-6&&x<=item.x+item.w+6&&y>=item.y-6&&y<=item.y+item.h+6)return item.box;}return null;}
function drawTextBoxes(context,c=cam,editing=false){
 context.save();
 for(const item of textBoxItems(c)){
  const {x,y,w,h,style,lines,lineHeight}=item;
  lines.forEach((line,i)=>drawText(context,line,x,y+lineHeight*(i+.5),style));
  if(editing&&item.box.id===selectedTextBoxId){context.strokeStyle='#27866b';context.lineWidth=1;context.setLineDash([4,3]);context.strokeRect(x-5,y-5,w+10,h+10);context.setLineDash([]);}
 }
 context.restore();
}
function textBoxesSvg(c){return textBoxItems(c).map(item=>`<g data-textbox="${item.box.id}">`+item.lines.map((line,i)=>svgText(line,item.x,item.y+item.lineHeight*(i+.5),item.style,'xml:space="preserve"')).join('')+'</g>').join('');}
function moveTextBox(box,dx,dy){const p=boxWorldPosition(box);box.positions[$('layout').value]={x:p.x+dx/cam.sx,y:p.y+dy/cam.sy};drawSoon();}
function setupStyling(){
 for(const prefix of ['selected','hover']){
  const getNode=()=>prefix==='selected'?selected:cladeNode;
  $(prefix+'ApplyStyle').onclick=safe(()=>changeNodeStyle(getNode(),prefix));
  $(prefix+'ResetStyle').onclick=()=>changeNodeStyle(getNode(),prefix,true);
 }
 $('textTarget').onchange=refreshGlobalStyle;$('applyGlobalStyle').onclick=safe(changeGlobalStyle);
 $('branchScope').onchange=refreshBranchEditor;$('applyBranchColor').onclick=safe(()=>changeBranchColor());$('resetBranchColor').onclick=()=>changeBranchColor(true);
 $('addTextbox').onclick=safe(addTextBox);$('addTextboxToolbar').onclick=safe(addTextBox);
 $('textboxList').onchange=()=>selectTextBox(textBoxes.find(box=>String(box.id)===$('textboxList').value)||null);
 $('applyTextbox').onclick=safe(editTextBox);$('removeTextbox').onclick=removeTextBox;
 $('textboxUseDefault').onclick=()=>{const box=selectedTextBox();if(!box)return;remember();box.style=null;refreshTextBoxEditor();drawSoon();updateExportPreview();};
 overlay.onkeydown=e=>{
  const box=selectedTextBox();if(!box)return;
  if(e.key==='Escape'){selectTextBox(null);return;}
  if(e.key==='Enter'){e.preventDefault();selectTextBox(box,true);return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeTextBox();return;}
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(delta){e.preventDefault();if(!e.repeat)remember();moveTextBox(box,delta[0]*(e.shiftKey?10:1),delta[1]*(e.shiftKey?10:1));updateExportPreview();}
 };
 refreshGlobalStyle();refreshTextBoxEditor();refreshBranchEditor();
}
