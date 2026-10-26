'use strict';
const $=id=>document.getElementById(id), palette=['#257e67','#cc9140','#6083b1','#a2698c','#779649','#bd6c57','#6c72a1','#348f9b'];
let root,viewRoot,scene,selected=null,annotations=new Map(),heatColumns=[],history=[],fileName='',pendingTSV=null,groupColors=new Map(),hits=[],cam={sx:1,sy:1,tx:50,ty:30},W=800,H=600,dpr=1,raf=0;
const branchCanvas=$('branches'),overlay=$('overlay'),ctx=overlay.getContext('2d');
let gl=null,gpu=null,fallback=null;
const backgroundCanvas=$('backgrounds'),backgroundCtx=backgroundCanvas.getContext('2d');
let highlightGroups=[],cladeNode=null,cladePinned=false,hoverCandidate=null,hoverTimer=0;

function message(s,error=false){$('status').textContent=s;if(error){$('toast').textContent=s;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',9000);}}
function safe(fn){return async (...args)=>{try{await fn(...args)}catch(e){message(e.message||String(e),true);console.error(e);}}}
function initializeRenderer(){try{
 gl=branchCanvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
 const shader=(type,src)=>{let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 let p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,'attribute vec2 a_pos; attribute vec3 a_color; uniform vec2 u_size; uniform vec2 u_scale; uniform vec2 u_offset; varying vec3 v_color; void main(){vec2 p=(a_pos*u_scale+u_offset)/u_size;gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0,1);v_color=a_color;}'));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,'precision mediump float; varying vec3 v_color; void main(){gl_FragColor=vec4(v_color,1.0);}'));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
 gpu={program:p,buffer:gl.createBuffer(),pos:gl.getAttribLocation(p,'a_pos'),color:gl.getAttribLocation(p,'a_color'),size:gl.getUniformLocation(p,'u_size'),scale:gl.getUniformLocation(p,'u_scale'),offset:gl.getUniformLocation(p,'u_offset'),count:0};
 let ext=gl.getExtension('WEBGL_debug_renderer_info'),name=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'Renderer information hidden by browser';
 $('rendererInfo').textContent='WebGL branch renderer · '+name+'. Hardware use depends on browser and driver.';$('renderNote').textContent='WebGL branches · adaptive labels';
 }catch(e){gl=null;gpu=null;let fresh=document.createElement('canvas');fresh.id='branches';branchCanvas.replaceWith(fresh);fallback=fresh.getContext('2d');$('renderNote').textContent='Canvas 2D fallback · adaptive labels';$('rendererInfo').textContent='WebGL unavailable. Branches use software Canvas 2D.';}
}
function validColor(c){return typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);}
function meta(n){if(n.children.length)return null;return annotations.get(n.name)||annotations.get(n.name.replace(/\/\d+-\d+$/,''))||null;}
function label(n){if(n.collapsed)return `${n.displayName??(n.name||'Clade')} · ${n.count.toLocaleString()} tips`;if(n.displayName!=null)return n.displayName;let m=meta(n);return m?.label?(m.label+($('keepid').checked?' | '+n.name:'')):n.name;}
function colorOf(n){let m=meta(n);return validColor(n.color)?n.color:validColor(appearance.branchColor)?appearance.branchColor:validColor(m?.color)?m.color:m?.group?groupColors.get(m.group)||'#257e67':'#598073';}
function rebuildColors(){groupColors=new Map();for(const m of annotations.values())if(m.group&&!groupColors.has(m.group))groupColors.set(m.group,palette[groupColors.size%palette.length]);$('legend').replaceChildren();for(const [g,c] of groupColors){let s=document.createElement('span'),dot=document.createElement('i');dot.style.background=c;s.append(dot,document.createTextNode(g));$('legend').append(s);}trackLegend();styleAnnotationLegend();uploadGeometry();}
function trackLegend(){let extras=[];const vals=[...annotations.values()].map(m=>m.value).filter(Number.isFinite);if(vals.length)extras.push('Bar: 0–'+Math.max(...vals).toPrecision(3));for(const k of heatColumns){let v=[...annotations.values()].map(m=>m.heat?.[k]).filter(Number.isFinite);if(v.length)extras.push(k+': '+Math.min(...v).toPrecision(3)+'–'+Math.max(...v).toPrecision(3));}if(extras.length){let note=document.createElement('div');note.className='muted';note.style.width='100%';note.textContent=extras.join(' · ');$('legend').append(note);}}
function uploadGeometry(){if(!gpu||!scene)return;const data=new Float32Array(scene.segments.length*10);let i=0;for(const s of scene.segments){let c=colorOf(s.n),rgb=[parseInt(c.slice(1,3),16)/255,parseInt(c.slice(3,5),16)/255,parseInt(c.slice(5,7),16)/255];for(const [x,y] of [[s.x1,s.y1],[s.x2,s.y2]]){data[i++]=x;data[i++]=y;for(const k of rgb)data[i++]=k;}}gl.bindBuffer(gl.ARRAY_BUFFER,gpu.buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gpu.count=data.length/5;}
function rebuild(fit=true){scene=Core.layout(viewRoot,$('layout').value,$('lengths').checked);Core.index(root);prepareLabelAnchors();highlightGroups=Clades.prepare(scene,viewRoot);uploadGeometry();updateStats();updateInspector();if(cladeNode)refreshCladePanel();if(fit)fitTree();else drawSoon();updateBootstrap();updateExportPreview();}
function updateStats(){const all=Core.walk(root),tips=all.filter(n=>!n.children.length);$('tipStat').firstChild.textContent=tips.length.toLocaleString();$('cladeStat').firstChild.textContent=(all.length-tips.length).toLocaleString();$('filename').textContent=fileName;$('summary').textContent=`${tips.length.toLocaleString()} tips · ${scene.tips.length.toLocaleString()} visible endpoints · ${$('layout').selectedOptions[0].text}`;let missing=all.filter(n=>n.parent&&n.length===null).length;message(`${tips.length.toLocaleString()} tips loaded. ${missing?missing+' edges have no length (drawn as 1 in length mode).':'Branch lengths preserved.'} Files stay on this computer.`);$('whole').disabled=viewRoot===root;}
function fitTree(){if(!scene)return;const legendOn=$('bootstrapEnabled').checked,legendTop=$('bootstrapCorner').value.startsWith('top'),legendSpace=legendOn?legendBox(W,H).h+24:0,top=legendOn&&legendTop?legendSpace:45,bottom=legendOn&&!legendTop?legendSpace:55;if($('layout').value==='rect'){let trackSpace=annotations.size&&$('tracks').checked?400:250;cam.sx=Math.max(.05,(W-trackSpace-65)/1000);cam.sy=Math.max(.001,(H-top-bottom)/Math.max(18,(scene.tips.length-1)*18));cam.tx=35;cam.ty=top;}else {let xs=scene.nodes.map(n=>n.x),ys=scene.nodes.map(n=>n.y),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);let s=Math.max(.01,Math.min((W-170)/Math.max(1,maxx-minx),(H-top-bottom)/Math.max(1,maxy-miny)));cam={sx:s,sy:s,tx:W/2-(minx+maxx)*s/2,ty:top+(H-top-bottom)/2-(miny+maxy)*s/2};}drawSoon();}
function drawSoon(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;render();});}
function resize(){let box=$('stage').getBoundingClientRect();W=Math.max(1,box.width);H=Math.max(1,box.height);dpr=Math.min(devicePixelRatio||1,2);for(const c of [backgroundCanvas,$('branches'),overlay]){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);}drawSoon();if(scene)updateExportPreview();}
function point(n,c=cam){return {x:n.x*c.sx+c.tx,y:n.y*c.sy+c.ty};}
function textItems(c=cam,w=W,h=H,all=false){
 const result=[],occupied=new Set(),rect=$('layout').value==='rect';let lastBottom=-Infinity;
 for(const n of scene.tips){
  if(!isNameVisible(n))continue;
  const style=nodeTextStyle(n),p=nodeNamePoint(n,c),text=label(n),width=measureText(text,style),height=style.size*1.3;
  if(!all&&(p.y+height/2<0||p.y-height/2>h||p.x>w||p.x+width<0))continue;
  const key=Math.floor(p.x/115)+':'+Math.floor(p.y/(height+3));
  if(!all&&n.labelVisible!==true&&(rect?p.y-height/2<lastBottom:occupied.has(key)))continue;
  lastBottom=p.y+height/2+3;occupied.add(key);result.push({n,...p,text,style,color:style.color,support:false});
 }
 const cells=new Set();
 for(const n of scene.nodes){
  if(!n.children.length||!nodeBaseName(n)||n.collapsed||!isNameVisible(n))continue;
  const p=nodeNamePoint(n,c),style=nodeTextStyle(n),height=style.size*1.3,width=measureText(nodeBaseName(n),style),key=Math.floor(p.x/55)+':'+Math.floor(p.y/(height+3));
  if(!all&&(p.x+width<0||p.x>w||p.y+height/2<0||p.y-height/2>h||(n.labelVisible!==true&&cells.has(key))))continue;
  cells.add(key);result.push({n,...p,text:nodeBaseName(n),style,color:style.color,support:true});
 }
 return result;
}
function trackData(c=cam,w=W,h=H,all=false){if(!$('tracks').checked||$('layout').value!=='rect'||!annotations.size)return [];let vals=[...annotations.values()].map(m=>m.value).filter(Number.isFinite),max=vals.length?Math.max(...vals):1;max=max||1;let ranges=heatColumns.map(k=>{let v=[...annotations.values()].map(m=>m.heat?.[k]).filter(Number.isFinite);return v.length?[Math.min(...v),Math.max(...v)]:[0,1];}),rects=[];let base=1000*c.sx+c.tx+235,height=Math.min(13,Math.max(1,18*c.sy*.8));
 for(const n of scene.tips){if(n.children.length)continue;let m=meta(n);if(!m)continue;let y=n.y*c.sy+c.ty;if(!all&&(y<0||y>h))continue;if(m.group||m.color)rects.push({x:base,y:y-height/2,w:8,h:height,color:colorOf(n)});if(Number.isFinite(m.value))rects.push({x:base+14,y:y-height/2,w:Math.max(1,m.value/max*65),h:height,color:'#b78642'});heatColumns.forEach((k,i)=>{let v=m.heat?.[k];if(!Number.isFinite(v))return;let [lo,hi]=ranges[i],t=hi===lo?.5:(v-lo)/(hi-lo),r=Math.round(238-t*215),g=Math.round(244-t*122),b=Math.round(231-t*137);rects.push({x:base+86+i*15,y:y-height/2,w:12,h:height,color:`rgb(${r},${g},${b})`});});}return rects;
}
function highlightPaths(c=cam){
 return Clades.envelopes(highlightGroups,$('layout').value,c,{
  align:$('align').checked,
  tipCount:scene.tips.length,
  labelWidth:n=>isNameVisible(n)?measureText(exportLabel({text:label(n),support:false,style:nodeTextStyle(n)}),nodeTextStyle(n)):0,
  labelBox:n=>{if(!isNameVisible(n))return null;const style=nodeTextStyle(n),p=nodeNamePoint(n,c),width=measureText(exportLabel({text:label(n),support:false,style}),style),height=style.size*1.35;return {x:p.x-5,y:p.y-height/2-3,w:width+10,h:height+6};},
  trackRight:annotations.size&&$('tracks').checked&&$('layout').value==='rect'?1000*c.sx+c.tx+235+86+15*heatColumns.length:null
 });
}
function render(){if(!scene)return;let t=performance.now();
 backgroundCtx.setTransform(dpr,0,0,dpr,0,0);backgroundCtx.clearRect(0,0,W,H);
 for(const shape of highlightPaths()){
  backgroundCtx.fillStyle=shape.color;backgroundCtx.globalAlpha=shape.opacity;
  backgroundCtx.fill(new Path2D(shape.d));
 }
 backgroundCtx.globalAlpha=1;

 if(gpu){gl.viewport(0,0,$('branches').width,$('branches').height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(gpu.program);gl.bindBuffer(gl.ARRAY_BUFFER,gpu.buffer);gl.enableVertexAttribArray(gpu.pos);gl.vertexAttribPointer(gpu.pos,2,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(gpu.color);gl.vertexAttribPointer(gpu.color,3,gl.FLOAT,false,20,8);gl.uniform2f(gpu.size,W,H);gl.uniform2f(gpu.scale,cam.sx,cam.sy);gl.uniform2f(gpu.offset,cam.tx,cam.ty);gl.drawArrays(gl.LINES,0,gpu.count);}
 else if(fallback){fallback.setTransform(dpr,0,0,dpr,0,0);fallback.clearRect(0,0,W,H);fallback.lineWidth=1;for(const s of scene.segments){fallback.strokeStyle=colorOf(s.n);fallback.beginPath();fallback.moveTo(s.x1*cam.sx+cam.tx,s.y1*cam.sy+cam.ty);fallback.lineTo(s.x2*cam.sx+cam.tx,s.y2*cam.sy+cam.ty);fallback.stroke();}}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);hits=[];let ts=textItems();ctx.font='11px system-ui';ctx.textBaseline='middle';
 for(const r of trackData()){ctx.fillStyle=r.color;ctx.fillRect(r.x,r.y,r.w,r.h);}
 drawSupportCanvas(ctx,cam,W,H);
 for(const n of scene.nodes){let p=point(n);if(p.x<0||p.x>W||p.y<0||p.y>H)continue;hits.push({x:p.x,y:p.y,n,r:7});if(n.collapsed){ctx.fillStyle=colorOf(n);ctx.beginPath();ctx.moveTo(p.x,p.y-5);ctx.lineTo(p.x+8,p.y);ctx.lineTo(p.x,p.y+5);ctx.fill();}}
 for(const item of ts){const text=exportLabel(item);drawText(ctx,text,item.x,item.y,item.style);hits.push({x:item.x,y:item.y,w:measureText(text,item.style),h:item.style.size*1.35,n:item.n});}
 if(selected&&scene.nodes.includes(selected)){let p=point(selected);ctx.strokeStyle='#d1993d';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.stroke();}
 drawScaleBar(ctx,cam,W,H);drawTextBoxes(ctx,cam,true);
 drawSupportCanvas(ctx,cam,W,H,true);
 window.canopyMetrics={tips:Core.walk(root).filter(n=>!n.children.length).length,visible:scene.nodes.length,segments:scene.segments.length,drawMs:performance.now()-t,renderer:gpu?'WebGL':'Canvas2D'};
}
function remember(){history.push({tree:Core.snapshot(root),view:viewRoot.id,decorations:decorationSnapshot(),camera:{...cam},selected:selected?.id??null,textbox:selectedTextBoxId});if(history.length>15)history.shift();$('undo').disabled=false;}
function select(n,center=false){selectedTextBoxId=null;refreshTextBoxEditor();selected=n;syncHighlightControls(n.highlight);if(center){for(let p=n.parent;p;p=p.parent)p.collapsed=false;if(!Core.walk(viewRoot).includes(n))viewRoot=root;rebuild(false);if($('layout').value==='rect'){cam.sy=Math.max(cam.sy,1);cam.ty=H/2-n.y*cam.sy;}else {cam.sx=cam.sy=Math.max(cam.sx,1);cam.tx=W/2-n.x*cam.sx;cam.ty=H/2-n.y*cam.sy;}}updateInspector();const p=point(n);openCladePanel(n,p.x,p.y,true);drawSoon();}
function updateInspector(){let n=selected;$('nodeName').textContent=n?label(n):'Click a branch endpoint';let m=n?meta(n):null;$('nodeMeta').textContent=n?`${n.children.length?'Descendant tips: '+n.count:'Original ID: '+n.name}\nIncoming length: ${n.length??'not supplied'}${m?.group?'\nGroup: '+m.group:''}${Number.isFinite(m?.value)?'\nValue: '+m.value:''}${m?.heat?'\n'+Object.entries(m.heat).map(([k,v])=>k+': '+v).join('\n'):''}`:'Inspect a sequence or work with a clade.';for(const id of ['collapse','rotate','focus'])$(id).disabled=!n||!n.children.length;$('reroot').disabled=!n||!n.parent;$('collapse').textContent=n?.collapsed?'Expand':'Collapse';
 $('inspectClade').disabled=!n;$('highlightClade').disabled=!n;
 $('clearHighlight').disabled=!n?.highlight;
 $('clearAllHighlights').disabled=!Core.walk(root).some(x=>x.highlight);refreshNodeEditor('selected',n);refreshBranchEditor();
}
function loadTree(text,name){let parsed=Core.parse(text);closeCladePanel();resetBootstrap();root=parsed;viewRoot=root;selected=null;restoreDecorations(null);annotations.clear();heatColumns=[];history=[];$('undo').disabled=true;fileName=name;$('comparison').textContent='Load another tree with the same unique tip IDs to compare.';$('search').value='';$('results').replaceChildren();rebuildColors();rebuild();}
function search(){let q=$('search').value.trim().toLowerCase();$('results').replaceChildren();if(!q){$('searchCount').textContent='Search original IDs and mapped names.';return;}let matches=Core.walk(root).filter(n=>!n.children.length&&[n.name,n.displayName,meta(n)?.label,meta(n)?.group].some(x=>x?.toLowerCase().includes(q)));$('searchCount').textContent=`${matches.length.toLocaleString()} matches · showing first 40`;for(const n of matches.slice(0,40)){let b=document.createElement('button');b.textContent=label(n);b.title=n.name;b.onclick=()=>select(n,true);$('results').append(b);}}
function zoom(f,x=W/2,y=H/2,both=false){let sx=cam.sx,sy=cam.sy;cam.sy=Math.max(.0001,Math.min(1000,cam.sy*f));cam.ty=y-(y-cam.ty)*cam.sy/sy;if($('layout').value!=='rect'||both){cam.sx=Math.max(.001,Math.min(1000,cam.sx*f));cam.tx=x-(x-cam.tx)*cam.sx/sx;}drawSoon();}
function nodeAt(x,y){
 let best=null,d=Infinity;
 for(const h of hits){
  let dist=h.w!==undefined?(x>=h.x&&x<=h.x+h.w&&Math.abs(y-h.y)<(h.h/2+3)?0:Infinity):Math.hypot(h.x-x,h.y-y);
  if(dist<d&&dist<8){d=dist;best=h.n;}
 }
 if(best)return best;
 // Branch selection also works away from endpoints. Rectangular vertical
 // connectors belong to their parent clade; horizontal edges to their child.
 d=4;
 for(const s of scene.segments){
  const ax=s.x1*cam.sx+cam.tx,ay=s.y1*cam.sy+cam.ty,bx=s.x2*cam.sx+cam.tx,by=s.y2*cam.sy+cam.ty;
  if(x<Math.min(ax,bx)-4||x>Math.max(ax,bx)+4||y<Math.min(ay,by)-4||y>Math.max(ay,by)+4)continue;
  const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/len)):0;
  const dist=Math.hypot(x-ax-t*dx,y-ay-t*dy);
  if(dist<d){d=dist;best=$('layout').value==='rect'&&s.x1===s.x2?s.n.parent:s.n;}
 }
 return best;
}
function cancelHover(){clearTimeout(hoverTimer);hoverTimer=0;hoverCandidate=null;}
function setCladePinned(value){cladePinned=value;$('hoverPin').textContent=value?'Unpin':'Pin';$('hoverPin').setAttribute('aria-pressed',String(value));}
function closeCladePanel(){cancelHover();cladeNode=null;setCladePinned(false);$('cladePanel').hidden=true;}
function refreshCladePanel(){
 if(!cladeNode)return;
 const result=Clades.labelsText(cladeNode,$('copyFormat').value,meta,label);
 $('cladePanelTitle').textContent=cladeNode.children.length?(nodeBaseName(cladeNode)?'Clade '+nodeBaseName(cladeNode):'Unnamed clade'):label(cladeNode);
 $('cladePanelCount').textContent=result.count.toLocaleString()+' descendant '+(result.count===1?'tip':'tips')+(cladeNode.collapsed?' · collapsed':'');
 if($('cladeText').value!==result.text)$('cladeText').value=result.text;
 $('hoverClearHighlight').disabled=!cladeNode.highlight;refreshNodeEditor('hover',cladeNode);
}
function openCladePanel(n,x=W/2,y=30,pin=false){
 cancelHover();const changed=cladeNode!==n;cladeNode=n;
 setCladePinned(pin);$('cladePanel').hidden=false;
 if(changed){$('cladeCopyStatus').textContent='';syncHighlightControls(n.highlight);}
 refreshCladePanel();
 const panel=$('cladePanel'),width=panel.offsetWidth||350,height=panel.offsetHeight||460;
 const left=x+20+width<W?x+20:x-width-20;
 panel.style.left=Math.max(8,Math.min(W-width-8,left))+'px';
 panel.style.top=Math.max(8,Math.min(H-height-8,y-16))+'px';
}
function scheduleCladeHover(n,x,y){
 if(cladePinned)return;
 if(!n){cancelHover();return;}
 if(n===cladeNode||n===hoverCandidate)return;
 cancelHover();hoverCandidate=n;
 hoverTimer=setTimeout(()=>{hoverTimer=0;hoverCandidate=null;if(!cladePinned)openCladePanel(n,x,y,false);},250);
}
function syncHighlightControls(style){
 if(!style)return;
 for(const id of ['highlightColor','hoverColor'])$(id).value=style.color;
 for(const id of ['highlightOpacity','hoverOpacity'])$(id).value=Math.round(style.opacity*100);
 updateOpacityReadout();
}
function updateOpacityReadout(){
 $('highlightOpacityValue').textContent=$('highlightOpacity').value+'% opacity';
 $('hoverOpacityValue').textContent=$('hoverOpacity').value+'% opacity';
}
function changeHighlight(node,remove=false){
 if(!node)return;
 remember();
 node.highlight=remove?null:{color:$('highlightColor').value,opacity:Number($('highlightOpacity').value)/100};
 selected=node;highlightGroups=Clades.prepare(scene,viewRoot);
 updateInspector();refreshCladePanel();drawSoon();
 message(remove?'Clade background removed.':'Clade background applied at '+$('highlightOpacity').value+'% opacity.');
}
async function copyCladeLabels(){
 if(!cladeNode)return;
 setCladePinned(true);const result=Clades.labelsText(cladeNode,$('copyFormat').value,meta,label);
 $('cladeText').focus();$('cladeText').select();let copied=false;
 if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(result.text);copied=true;}catch{}}
 if(!copied&&document.execCommand){try{copied=document.execCommand('copy');}catch{}}
 $('cladeCopyStatus').textContent=copied?'Copied '+result.count.toLocaleString()+' tip labels.':'Text selected. Press Ctrl+C (Cmd+C on Mac), or download the list.';
}
let drag=null;
overlay.onpointerdown=e=>{
 if(e.button!=null&&e.button!==0)return;
 cancelHover();overlay.focus?.({preventScroll:true});
 const box=textBoxAt(e.offsetX,e.offsetY);if(box)selectTextBox(box);
 drag={x:e.offsetX,y:e.offsetY,startX:e.offsetX,startY:e.offsetY,moved:false,box};overlay.setPointerCapture(e.pointerId);
};
overlay.onpointermove=e=>{
 if(!drag){const box=textBoxAt(e.offsetX,e.offsetY);overlay.style.cursor=box?'move':'grab';if(box){cancelHover();return;}scheduleCladeHover(nodeAt(e.offsetX,e.offsetY),e.offsetX,e.offsetY);return;}
 if(!drag.moved&&Math.hypot(e.offsetX-drag.startX,e.offsetY-drag.startY)<=4)return;
 if(!drag.moved){if(drag.box)remember();else if(!cladePinned)closeCladePanel();drag.moved=true;}
 const dx=e.offsetX-drag.x,dy=e.offsetY-drag.y;
 if(drag.box)moveTextBox(drag.box,dx,dy);else {cam.tx+=dx;cam.ty+=dy;drawSoon();}
 drag.x=e.offsetX;drag.y=e.offsetY;
};
overlay.onpointerup=e=>{
 if(drag&&!drag.moved&&!drag.box){const n=nodeAt(e.offsetX,e.offsetY);if(n)select(n);else {selectTextBox(null);if(!cladePinned)closeCladePanel();}}
 if(drag?.box)updateExportPreview();drag=null;
};
overlay.onpointercancel=()=>{drag=null;cancelHover();updateExportPreview();};overlay.onpointerleave=cancelHover;

overlay.addEventListener('wheel',e=>{e.preventDefault();cancelHover();zoom(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.005),e.offsetX,e.offsetY,e.shiftKey);},{passive:false});
$('cladePanel').onpointerenter=cancelHover;
$('cladePanel').onfocusin=e=>{if(e.target!==$('hoverPin')&&e.target!==$('closeCladePanel'))setCladePinned(true);};
$('cladeText').onfocus=()=>setCladePinned(true);
$('hoverPin').onclick=()=>{cancelHover();setCladePinned(!cladePinned);};
$('closeCladePanel').onclick=closeCladePanel;
$('copyFormat').onchange=()=>{setCladePinned(true);$('cladeCopyStatus').textContent='';refreshCladePanel();};
$('copyClade').onclick=safe(copyCladeLabels);
$('selectCladeText').onclick=()=>{setCladePinned(true);$('cladeText').focus();$('cladeText').select();};
$('downloadClade').onclick=()=>{if(!cladeNode)return;setCladePinned(true);const mode=$('copyFormat').value,r=Clades.labelsText(cladeNode,mode,meta,label);download(baseName()+'_clade_'+cladeNode.id+'_'+mode+(mode==='tsv'?'.tsv':'.txt'),r.text+'\n',mode==='tsv'?'text/tab-separated-values':'text/plain');};
$('inspectClade').onclick=()=>{if(selected){const p=point(selected);openCladePanel(selected,p.x,p.y,true);}};
for(const [a,b] of [['highlightColor','hoverColor'],['hoverColor','highlightColor'],['highlightOpacity','hoverOpacity'],['hoverOpacity','highlightOpacity']])$(a).oninput=()=>{$(b).value=$(a).value;updateOpacityReadout();};
$('highlightClade').onclick=()=>changeHighlight(selected);
$('clearHighlight').onclick=()=>changeHighlight(selected,true);
$('hoverHighlight').onclick=()=>{setCladePinned(true);changeHighlight(cladeNode);};
$('hoverClearHighlight').onclick=()=>{setCladePinned(true);changeHighlight(cladeNode,true);};
$('clearAllHighlights').onclick=()=>{remember();for(const n of Core.walk(root))n.highlight=null;highlightGroups=[];updateInspector();refreshCladePanel();drawSoon();message('All clade backgrounds cleared.');};
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCladePanel();});
function download(name,content,type){let blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const baseName=()=>fileName.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'_')||'tree';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function exportLabel(t){let text=t.text;const style=t.style||appearance.text[t.support?'nodes':'tips'];if($('layout').value==='rect'&&annotations.size&&$('tracks').checked&&!t.support){ctx.font=canvasFont(style);if(ctx.measureText(text).width>215){while(text.length&&ctx.measureText(text+'…').width>215)text=text.slice(0,-1);text+='…';}}return text;}
function svgExport(full){download(baseName()+(full?'_full':'_view')+'.svg',svgDocument(exportFrame(full)),'image/svg+xml');message('Vector SVG exported with current labels and display styles.');}
function demo(){let seed=7;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};function make(start,count){if(count===1)return `Demo_${String(start+1).padStart(4,'0')}/59-226:${(.03+rand()*.15).toFixed(4)}`;let half=Math.floor(count/2);return `(${make(start,half)},${make(start+half,count-half)})${Math.floor(70+rand()*30)}:${(.02+rand()*.09).toFixed(4)}`;}loadTree(make(0,128)+';','Example protein family');for(const [i,n] of Core.walk(root).filter(n=>!n.children.length).entries()){let g=['Group A','Group B','Reference','Unclassified'][Math.floor(i/32)];annotations.set(n.name,{label:'Example protein '+(i+1),group:g,value:Math.round(rand()*90),heat:{score:rand()},color:''});}heatColumns=['score'];rebuildColors();fitTree();message('Synthetic example data — open your .treefile to begin.');}
function options(){return Object.fromEntries(['layout','lengths','labels','supports','align','keepid','tracks'].map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));}
function session(){return {app:'CanopyOffline',version:1,fileName,tree:Core.snapshot(root),view:viewRoot.id,annotations:[...annotations],heatColumns,options:options(),camera:cam,...decorationSnapshot()};}
function loadSession(s){if(s.app!=='CanopyOffline'||s.version!==1)throw Error('Unsupported session format');let parsed=Core.restore(s.tree),ann=new Map();cleanTextBoxes(s.textBoxes);if(!Array.isArray(s.annotations))throw Error('Invalid session annotations');for(const [k,v] of s.annotations){if(typeof k!=='string'||typeof v!=='object'||!v)throw Error('Invalid annotation');ann.set(k,{label:String(v.label||''),group:String(v.group||''),color:validColor(v.color)?v.color:'',value:Number.isFinite(v.value)&&v.value>=0?v.value:null,heat:Object.fromEntries(Object.entries(v.heat||{}).filter(([k,x])=>Number.isFinite(x)))});}closeCladePanel();resetBootstrap();root=parsed;viewRoot=Core.walk(root).find(n=>n.id===s.view)||root;annotations=ann;heatColumns=Array.isArray(s.heatColumns)?s.heatColumns.map(String):[];fileName=String(s.fileName||'Session');history=[];selected=null;restoreDecorations(s);$('undo').disabled=true;for(const [id,v] of Object.entries(s.options||{})){if(!Object.hasOwn(options(),id))continue;if($(id).type==='checkbox')$(id).checked=!!v;else if(['rect','circular','unrooted'].includes(v))$(id).value=v;}rebuildColors();rebuild();if(s.camera&&['sx','sy','tx','ty'].every(k=>Number.isFinite(s.camera[k]))&&s.camera.sx>0&&s.camera.sy>0)cam={...s.camera};drawSoon();}
$('openBtn').onclick=()=>$('treeFile').click();$('treeFile').onchange=safe(async e=>{let f=e.target.files[0];if(f)loadTree(await f.text(),f.name);e.target.value='';});
$('helpBtn').onclick=()=>$('help').showModal();$('closeHelp').onclick=()=>$('help').close();$('closeMapping').onclick=()=>$('mapping').close();
$('layout').onchange=()=>rebuild();$('lengths').onchange=()=>rebuild();for(const id of ['labels','supports','align','keepid','tracks'])$(id).onchange=()=>{drawSoon();updateInspector();refreshCladePanel();if(id==='keepid'){search();refreshCladePanel();}};
$('fit').onclick=fitTree;$('readable').onclick=()=>{if($('layout').value==='rect'){cam.sy=readableRowGap()/18;cam.ty=30-(selected?.y||0)*cam.sy;drawSoon();}else zoom(3);};$('zoomIn').onclick=()=>zoom(1.4);$('zoomOut').onclick=()=>zoom(1/1.4);
$('search').oninput=search;$('demo').onclick=demo;
$('ladder').onclick=()=>{remember();Core.index(root);for(const n of Core.walk(root))n.children.sort((a,b)=>b.count-a.count);rebuild();};
$('expand').onclick=()=>{remember();for(const n of Core.walk(root))n.collapsed=false;rebuild();};
$('undo').onclick=()=>{let last=history.pop();if(!last)return;closeCladePanel();root=Core.restore(last.tree);viewRoot=Core.walk(root).find(n=>n.id===last.view)||root;restoreDecorations(last.decorations);selected=Core.walk(root).find(n=>n.id===last.selected)||null;selectedTextBoxId=textBoxes.some(b=>b.id===last.textbox)?last.textbox:null;if(last.camera)cam={...last.camera};$('undo').disabled=!history.length;rebuild(false);refreshTextBoxEditor();search();};
$('collapse').onclick=()=>{if(!selected)return;remember();selected.collapsed=!selected.collapsed;rebuild();};$('rotate').onclick=()=>{if(!selected)return;remember();selected.children.reverse();rebuild();};
$('focus').onclick=()=>{if(selected){remember();viewRoot=selected;rebuild();}};$('whole').onclick=()=>{viewRoot=root;rebuild();};
$('reroot').onclick=safe(()=>{if(!selected?.parent)return;remember();closeCladePanel();root=Core.reroot(root,selected);viewRoot=root;rebuild();message('Root placed halfway along the selected edge. Pairwise distances retained for supplied lengths.');});
$('annotBtn').onclick=()=>$('annotationFile').click();$('annotationFile').onchange=safe(async e=>{let f=e.target.files[0];if(!f)return;pendingTSV=Core.tsv(await f.text());for(const id of ['idColumn','nameColumn']){$(id).replaceChildren();pendingTSV.header.forEach((name,i)=>{let o=document.createElement('option');o.value=i;o.textContent=name;$(id).append(o);});}let hs=pendingTSV.header.map(x=>x.toLowerCase());$('idColumn').value=Math.max(0,hs.findIndex(x=>['id','from','accession','entry'].includes(x)));$('nameColumn').value=Math.max(0,hs.findIndex(x=>['label','protein names','gene names','name'].includes(x)));$('mapping').showModal();e.target.value='';});
$('applyMapping').onclick=safe(()=>{let {header,rows}=pendingTSV,idCol=+$('idColumn').value,nameCol=+$('nameColumn').value,low=header.map(x=>x.toLowerCase()),next=new Map(),find=k=>low.indexOf(k),heat=header.filter(x=>x.startsWith('heat:'));for(const [i,row] of rows.entries()){let id=(row[idCol]||'').trim();if(!id)continue;const get=k=>(row[find(k)]||'').trim();let color=get('color');if(color&&!validColor(color))throw Error(`Row ${i+2}: color must be #RRGGBB`);let val=get('value'),value=val===''?null:Number(val);if(value!==null&&(!Number.isFinite(value)||value<0))throw Error(`Row ${i+2}: value must be nonnegative`);let m={label:(row[nameCol]||'').trim(),group:get('group'),color,value,heat:{}};for(const k of heat){let val=(row[header.indexOf(k)]||'').trim();if(!val)continue;if(!Number.isFinite(+val))throw Error(`Row ${i+2}: invalid heat value`);m.heat[k.slice(5)]=+val;}if(next.has(id)&&JSON.stringify(next.get(id))!==JSON.stringify(m))throw Error(`Conflicting duplicate mapping for ${id}; resolve it before importing.`);next.set(id,m);}annotations=next;heatColumns=heat.map(x=>x.slice(5));let tips=Core.walk(root).filter(n=>!n.children.length),matched=tips.filter(n=>meta(n)).length;rebuildColors();$('mapping').close();fitTree();updateInspector();refreshCladePanel();search();message(`Mapped ${matched.toLocaleString()} / ${tips.length.toLocaleString()} tips. Unmapped tips retain their original IDs.`);});
$('template').onclick=()=>download('canopy_annotations.tsv','id\tlabel\tgroup\tcolor\tvalue\theat:score\nMEV5246545.1\tLocal protein name\tGroup A\t#208568\t12\t0.8\n','text/tab-separated-values');
$('compareBtn').onclick=()=>$('compareFile').click();$('compareFile').onchange=safe(async e=>{let f=e.target.files[0];if(!f)return;message('Comparing unrooted splits…');let other=Core.parse(await f.text()),r=Core.compare(root,other);$('comparison').textContent=`${f.name}\n${r.tips.toLocaleString()} shared tips\nRF: ${r.rf.toLocaleString()} · normalized ${r.normalized.toFixed(4)}\nShared splits: ${r.common.toLocaleString()}\nSplits: ${r.splitsA.toLocaleString()} vs ${r.splitsB.toLocaleString()}`;$('comparison').style.whiteSpace='pre-line';message('Comparison complete. Root position, branch lengths and supports are ignored.');e.target.value='';});
$('saveBtn').onclick=()=>download(baseName()+'.canopy.json',JSON.stringify(session()),'application/json');$('loadSession').onclick=()=>$('sessionFile').click();$('sessionFile').onchange=safe(async e=>{let f=e.target.files[0];if(f)loadSession(JSON.parse(await f.text()));e.target.value='';});
$('newick').onclick=()=>download(baseName()+'_edited.nwk',Core.write(root),'text/plain');$('renamed').onclick=()=>{const names=Core.walk(root).filter(n=>!n.children.length).map(label);if(new Set(names).size<names.length){message('Displayed tip names are not unique. Give edited tips unique names, or enable “Keep accession” for mapped labels.',true);return;}download(baseName()+'_renamed.nwk',Core.write(root,label),'text/plain');};
$('svg').onclick=()=>svgExport(false);$('svgFull').onclick=()=>svgExport(true);$('png').onclick=safe(exportRaster);
$('stage').ondragover=e=>{e.preventDefault();};$('stage').ondrop=safe(async e=>{e.preventDefault();let f=e.dataTransfer.files[0];if(!f)return;let s=await f.text();if(f.name.endsWith('.json'))loadSession(JSON.parse(s));else loadTree(s,f.name);});
setupExtras();setupStyling();initializeRenderer();new ResizeObserver(resize).observe($('stage'));resize();demo();
// Exposed for local scientific validation and inspection; never sends data.
window.Canopy={Core,loadTree,session,loadSession,get root(){return root},get scene(){return scene},select,render,fitTree};
