'use strict';
let bootstrapCache=null,exportBusy=false;
function nodeBaseName(n){return n.displayName??(meta(n)?.label||n.name);}
function isNameVisible(n){if(typeof n.labelVisible==='boolean')return n.labelVisible;return n.children.length&&!n.collapsed?$('supports').checked:$('labels').checked;}
function refreshNodeEditor(prefix,n){
 const input=$(prefix+'Name');input.disabled=!n;
 if(document.activeElement!==input)input.value=n?nodeBaseName(n):'';
 for(const suffix of ['Rename','ResetName','ShowName','HideName','AutoName'])$(prefix+suffix).disabled=!n;
 $(prefix+'NameStatus').textContent=n?((isNameVisible(n)?'Shown':'Hidden')+(n.labelVisible==null?' · global setting':' · individual setting')):'Select a node to edit its name.';refreshNodeStyle(prefix,n);
}
function editNodeName(n,text,reset=false){
 if(!n)return;
 const value=String(text).trim();
 if(!reset&&(!value||value.length>1000))throw Error('Enter a name between 1 and 1,000 characters.');
 remember();n.displayName=reset?null:value;if(!reset)n.labelVisible=true;
 updateInspector();refreshCladePanel();search();drawSoon();
 message(reset?'Original or mapped name restored.':'Display name updated; original ID and support values retained.');
}
function setNodeNameVisibility(n,value){if(!n)return;remember();n.labelVisible=value;updateInspector();refreshCladePanel();drawSoon();message(value===null?'Global label settings restored.':value?'Selected node name shown.':'Selected node name hidden.');}
function resetBootstrap(){
 $('bootstrapEnabled').checked=false;bootstrapCache=null;$('bootstrapOptions').hidden=true;
 $('bootstrapStatus').textContent='Off. Support values are processed only when enabled.';
}
function updateBootstrap(){
 if(!$('bootstrapEnabled').checked){bootstrapCache=null;return;}
 bootstrapCache=BootstrapViz.collect(Core.walk(root),Number($('bootstrapField').value),Number($('bootstrapScale').value));
 $('bootstrapStatus').textContent=bootstrapCache.values.size.toLocaleString()+' values loaded; '+bootstrapCache.skipped.toLocaleString()+' missing or invalid. Zoom in to separate dense circles.';
}
function legendBox(w,h){
 const corner=$('bootstrapCorner').value,style=appearance.text.legend,size=style.size;
 const title='Bootstrap · value '+((bootstrapCache?.field??Number($('bootstrapField').value))+1),caption='Filled area = support percentage';
 const width=Math.max(236,measureText(title,style)+24,measureText(caption,style)+24,(measureText('100%',style)+20)*5+24);
 const titleY=10+size/2,captionY=titleY+size*1.5,gaugeY=captionY+size/2+18,valueY=gaugeY+13+size/2,height=valueY+size/2+12;
 return {x:corner.includes('left')?8:Math.max(8,w-width-8),y:corner.includes('bottom')?Math.max(8,h-height-8):8,w:width,h:height,title,caption,titleY,captionY,gaugeY,valueY,style};
}
function supportMarks(c,w,h){
 if(!$('bootstrapEnabled').checked||!bootstrapCache)return [];
 const marks=[],r=Math.max(2,Math.min(18,Number($('bootstrapRadius').value)||6));
 for(const n of scene.nodes){const support=bootstrapCache.values.get(n.id);if(!support)continue;const p=point(n,c);if(p.x+r<0||p.x-r>w||p.y+r<0||p.y-r>h)continue;marks.push({...p,r,fraction:support.fraction});}return marks;
}
function drawSupportCanvas(context,c,w,h,legend=false){
 if(!$('bootstrapEnabled').checked||!bootstrapCache)return;
 if(!legend){for(const m of supportMarks(c,w,h))BootstrapViz.drawCircle(context,m.x,m.y,m.r,m.fraction);return;}
 const b=legendBox(w,h);context.save();context.fillStyle='#ffffff';context.globalAlpha=.96;context.fillRect(b.x,b.y,b.w,b.h);context.globalAlpha=1;context.strokeStyle='#d8e5dd';context.lineWidth=1;context.strokeRect(b.x,b.y,b.w,b.h);
 drawText(context,b.title,b.x+12,b.y+b.titleY,b.style);drawText(context,b.caption,b.x+12,b.y+b.captionY,b.style);
 [0,.25,.5,.75,1].forEach((fraction,i)=>{const x=b.x+b.w*(i+.5)/5;BootstrapViz.drawCircle(context,x,b.y+b.gaugeY,8,fraction);drawText(context,Math.round(fraction*100)+'%',x,b.y+b.valueY,b.style,'center');});context.restore();
}
function supportSvg(c,w,h,legend=false){
 if(!$('bootstrapEnabled').checked||!bootstrapCache)return '';
 if(!legend)return '<g data-support-circles="true">'+supportMarks(c,w,h).map(m=>BootstrapViz.svgCircle(m.x,m.y,m.r,m.fraction)).join('')+'</g>';
 const b=legendBox(w,h);let s=`<g data-support-legend="true"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="white" fill-opacity="0.96" stroke="#d8e5dd"/>`+svgText(b.title,b.x+12,b.y+b.titleY,b.style)+svgText(b.caption,b.x+12,b.y+b.captionY,b.style);
 [0,.25,.5,.75,1].forEach((fraction,i)=>{const x=b.x+b.w*(i+.5)/5;s+=BootstrapViz.svgCircle(x,b.y+b.gaugeY,8,fraction)+svgText(Math.round(fraction*100)+'%',x,b.y+b.valueY,b.style,'text-anchor="middle"');});return s+'</g>';
}
function exportFrame(full=false){
 let c={...cam},w=W,h=H;
 if(full){
  if($('layout').value==='rect'){const gap=readableRowGap();w=1600+15*heatColumns.length;h=Math.max(150,scene.tips.length*gap+80);c={sx:1,sy:gap/18,tx:40,ty:40};}
  else{let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;for(const n of scene.nodes){minx=Math.min(minx,n.x);maxx=Math.max(maxx,n.x);miny=Math.min(miny,n.y);maxy=Math.max(maxy,n.y);}w=maxx-minx+650;h=maxy-miny+160;c={sx:1,sy:1,tx:60-minx,ty:80-miny};}
  // Extend the frame for actual styled text and all free textboxes, including
  // objects moved outside the viewport. Never clip them to the old margin.
  let left=0,top=0,right=w,bottom=h;
  for(const t of textItems(c,w,h,true)){const width=measureText(exportLabel(t),t.style),half=t.style.size*.75;left=Math.min(left,t.x-24);right=Math.max(right,t.x+width+24);top=Math.min(top,t.y-half-24);bottom=Math.max(bottom,t.y+half+24);}
  for(const box of textBoxItems(c)){left=Math.min(left,box.x-24);right=Math.max(right,box.x+box.w+24);top=Math.min(top,box.y-24);bottom=Math.max(bottom,box.y+box.h+24);}
  c.tx-=left;c.ty-=top;w=right-left;h=bottom-top;
  if($('bootstrapEnabled').checked){const legend=legendBox(w,h),space=legend.h+24;w=Math.max(w,legend.w+24);h+=space;if($('bootstrapCorner').value.startsWith('top'))c.ty+=space;}
 }
 return {c,w,h,full};
}
function scaleBar(c,w,h){
 if(!$('lengths').checked||$('layout').value==='unrooted')return null;
 const unit=$('layout').value==='rect'?1000:600,px=unit/scene.max*c.sx,value=10**Math.floor(Math.log10(90/px)),length=value*px;
 if(!Number.isFinite(length)||length<=0||length>w/2)return null;
 const style=appearance.text.scale,text=value.toPrecision(2)+' subst/site',textWidth=measureText(text,style),x=Math.max(10,w-20-Math.max(length,textWidth));let y=h-30;
 if($('bootstrapEnabled').checked&&bootstrapCache&&$('bootstrapCorner').value.startsWith('bottom')){const b=legendBox(w,h);if(x<b.x+b.w&&x+Math.max(length,textWidth)>b.x)y=Math.min(y,b.y-12);}
 return {x,y,length,text,style};
}
function drawScaleBar(context,c,w,h){const bar=scaleBar(c,w,h);if(!bar)return;context.save();context.strokeStyle=bar.style.color;context.lineWidth=1;context.beginPath();context.moveTo(bar.x,bar.y);context.lineTo(bar.x+bar.length,bar.y);context.stroke();drawText(context,bar.text,bar.x,bar.y-bar.style.size*1.2,bar.style);context.restore();}
function renderPublication(context,frame){
 const {c,w,h,full}=frame;
 context.save();context.fillStyle='white';context.fillRect(0,0,w,h);
 for(const shape of highlightPaths(c)){context.fillStyle=shape.color;context.globalAlpha=shape.opacity;context.fill(new Path2D(shape.d));}context.globalAlpha=1;
 context.lineWidth=1;
 for(const s of scene.segments){context.strokeStyle=colorOf(s.n);context.beginPath();context.moveTo(s.x1*c.sx+c.tx,s.y1*c.sy+c.ty);context.lineTo(s.x2*c.sx+c.tx,s.y2*c.sy+c.ty);context.stroke();}
 for(const t of trackData(c,w,h,full)){context.fillStyle=t.color;context.fillRect(t.x,t.y,t.w,t.h);}
 drawSupportCanvas(context,c,w,h);
 for(const n of scene.tips)if(n.collapsed){const p=point(n,c);context.fillStyle=colorOf(n);context.beginPath();context.moveTo(p.x,p.y-5);context.lineTo(p.x+8,p.y);context.lineTo(p.x,p.y+5);context.closePath();context.fill();}
 context.textBaseline='middle';context.textAlign='left';
 for(const t of textItems(c,w,h,full))drawText(context,exportLabel(t),t.x,t.y,t.style);
 drawScaleBar(context,c,w,h);drawTextBoxes(context,c);
 drawSupportCanvas(context,c,w,h,true);context.restore();
}
function svgDocument(frame){
 const {c,w,h,full}=frame,printWidth=Number($('printWidth').value)||8;
 let out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${printWidth}in" height="${printWidth*h/w}in" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/>`];
 for(const shape of highlightPaths(c))out.push(`<path data-clade="${shape.node.id}" d="${shape.d}" fill="${shape.color}" fill-opacity="${shape.opacity}"/>`);
 out.push('<g fill="none" stroke-width="1">');for(const s of scene.segments)out.push(`<path stroke="${colorOf(s.n)}" d="M${s.x1*c.sx+c.tx},${s.y1*c.sy+c.ty}L${s.x2*c.sx+c.tx},${s.y2*c.sy+c.ty}"/>`);out.push('</g>');
 for(const t of trackData(c,w,h,full))out.push(`<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="${t.color}"/>`);
 out.push(supportSvg(c,w,h));
 for(const n of scene.tips)if(n.collapsed){const p=point(n,c);out.push(`<path d="M${p.x} ${p.y-5}L${p.x+8} ${p.y}L${p.x} ${p.y+5}Z" fill="${colorOf(n)}"/>`);}
 for(const t of textItems(c,w,h,full))out.push(svgText(exportLabel(t),t.x,t.y,t.style,`data-node-label="${t.n.id}"`));
 const bar=scaleBar(c,w,h);if(bar)out.push(`<path d="M${bar.x} ${bar.y}h${bar.length}" stroke="${bar.style.color}"/>`+svgText(bar.text,bar.x,bar.y-bar.style.size*1.2,bar.style));
 out.push(textBoxesSvg(c));
 out.push(supportSvg(c,w,h,true),'</svg>');return out.join('');
}
function exportSettings(){
 const frame=exportFrame($('exportArea').value==='full'),dpi=$('exportDpi').value==='custom'?Number($('customDpi').value):Number($('exportDpi').value);
 return {frame,dims:Publication.dimensions(frame.w,frame.h,Number($('printWidth').value),dpi),format:$('exportFormat').value};
}
function updateExportPreview(){
 $('customDpiRow').hidden=$('exportDpi').value!=='custom';
 if(!scene)return;
 try{const {dims}=exportSettings();$('exportSummary').textContent=`${dims.width.toLocaleString()} × ${dims.height.toLocaleString()} px · ${dims.inches} × ${dims.heightInches.toFixed(2)} in`;$('png').disabled=exportBusy;}
 catch(e){$('exportSummary').textContent=e.message;$('png').disabled=true;}
}
async function exportRaster(){
 if(exportBusy)return;
 const {frame,dims,format}=exportSettings();exportBusy=true;$('png').disabled=true;message('Rendering '+dims.width.toLocaleString()+' × '+dims.height.toLocaleString()+' pixels…');
 try{
  const out=document.createElement('canvas');out.width=dims.width;out.height=dims.height;
  const context=out.getContext('2d');if(!context||out.width!==dims.width||out.height!==dims.height)throw Error('This browser cannot allocate the requested image size. Reduce print width or DPI.');
  context.fillStyle='white';context.fillRect(0,0,dims.width,dims.height);context.setTransform(dims.scale,0,0,dims.scale,0,0);renderPublication(context,frame);
  const mime=format==='jpeg'?'image/jpeg':'image/png';
  const blob=await new Promise((resolve,reject)=>out.toBlob(value=>value?resolve(value):reject(Error('Image encoding failed; reduce print width or DPI.')),mime,.96));
  const bytes=new Uint8Array(await blob.arrayBuffer()),encoded=format==='jpeg'?Publication.jpegDpi(bytes,dims.dpi):Publication.pngDpi(bytes,dims.dpi);
  download(baseName()+(frame.full?'_full':'_view')+'_'+dims.dpi+'dpi.'+(format==='jpeg'?'jpg':'png'),new Blob([encoded],{type:mime}));
  message(`Exported ${dims.width.toLocaleString()} × ${dims.height.toLocaleString()} pixels at ${dims.dpi} DPI.`);
 }finally{exportBusy=false;updateExportPreview();}
}
function setupExtras(){
 for(const prefix of ['selected','hover']){
  const getNode=()=>prefix==='selected'?selected:cladeNode;
  $(prefix+'Rename').onclick=safe(()=>editNodeName(getNode(),$(prefix+'Name').value));
  $(prefix+'ResetName').onclick=()=>editNodeName(getNode(),'',true);
  $(prefix+'Name').onkeydown=e=>{if(e.key==='Enter')$(prefix+'Rename').click();};
  $(prefix+'ShowName').onclick=()=>setNodeNameVisibility(getNode(),true);
  $(prefix+'HideName').onclick=()=>setNodeNameVisibility(getNode(),false);
  $(prefix+'AutoName').onclick=()=>setNodeNameVisibility(getNode(),null);
 }
 $('bootstrapEnabled').onchange=()=>{$('bootstrapOptions').hidden=!$('bootstrapEnabled').checked;if($('bootstrapEnabled').checked)updateBootstrap();else resetBootstrap();fitTree();updateExportPreview();};
 for(const id of ['bootstrapField','bootstrapScale'])$(id).onchange=()=>{updateBootstrap();drawSoon();};
 $('bootstrapRadius').onchange=()=>drawSoon();$('bootstrapCorner').onchange=()=>{if($('bootstrapEnabled').checked)fitTree();updateExportPreview();};
 for(const id of ['exportArea','exportFormat','exportDpi','customDpi','printWidth'])$(id).onchange=updateExportPreview;
 $('customDpi').oninput=updateExportPreview;$('printWidth').oninput=updateExportPreview;
}
