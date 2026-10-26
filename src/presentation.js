/* Optional support graphics and publication-resolution image encoding. */
'use strict';
const BootstrapViz = (() => {
  let calculations=0;
  function collect(nodes,field=0,scale=100){
    calculations++;
    const values=new Map();let skipped=0;
    for(const n of nodes){
      if(!n.parent||!n.children.length)continue;
      const parts=String(n.name).split('/'), raw=parts[field];
      if(!raw||!/^\d+(?:\.\d+)?$/.test(raw)){skipped++;continue;}
      const value=Number(raw);
      if(!Number.isFinite(value)||value<0||value>scale){skipped++;continue;}
      values.set(n.id,{value,fraction:value/scale});
    }
    return {values,field,scale,skipped};
  }
  function piePath(x,y,r,fraction){
    if(fraction<=0)return '';
    if(fraction>=1)return `M${x+r} ${y}A${r} ${r} 0 1 1 ${x-r} ${y}A${r} ${r} 0 1 1 ${x+r} ${y}Z`;
    const a=-Math.PI/2+fraction*Math.PI*2;
    return `M${x} ${y}L${x} ${y-r}A${r} ${r} 0 ${fraction>.5?1:0} 1 ${x+r*Math.cos(a)} ${y+r*Math.sin(a)}Z`;
  }
  function drawCircle(context,x,y,r,fraction){
    context.save();context.fillStyle='#eef5f2';context.beginPath();context.arc(x,y,r,0,2*Math.PI);context.fill();
    if(fraction>0){context.globalAlpha=.42;context.fillStyle='#37846b';context.beginPath();if(fraction>=1){context.arc(x,y,r,0,2*Math.PI);}else{context.moveTo(x,y);context.arc(x,y,r,-Math.PI/2,-Math.PI/2+2*Math.PI*fraction);context.closePath();}context.fill();context.globalAlpha=1;}
    context.strokeStyle='#87b7a2';context.lineWidth=.7;context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.stroke();context.restore();
  }
  function svgCircle(x,y,r,fraction){return `<circle cx="${x}" cy="${y}" r="${r}" fill="#eef5f2"/><path d="${piePath(x,y,r,fraction)}" fill="#37846b" fill-opacity="0.42"/><circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#87b7a2" stroke-width="0.7"/>`;}
  return {collect,piePath,drawCircle,svgCircle,get calculations(){return calculations;}};
})();
const Publication = (() => {
  function dimensions(width,height,inches,dpi){
    if(!Number.isFinite(inches)||inches<=0||inches>50)throw Error('Print width must be greater than 0 and at most 50 inches.');
    if(!Number.isInteger(dpi)||dpi<72||dpi>2400)throw Error('Choose a whole-number DPI from 72 to 2400.');
    if(!(width>0&&height>0))throw Error('The image area is empty.');
    const pixelsW=Math.round(inches*dpi),pixelsH=Math.round(pixelsW*height/width);
    if(pixelsW<1||pixelsH<1)throw Error('Image dimensions must be at least one pixel.');
    if(pixelsW>16384||pixelsH>16384||pixelsW*pixelsH>64000000)throw Error('Image exceeds the 16,384-pixel side / 64-megapixel export limit. Export the current view, collapse clades, reduce print width or DPI, or use Full SVG.');
    return {width:pixelsW,height:pixelsH,scale:pixelsW/width,dpi,inches,heightInches:pixelsH/dpi};
  }
  function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
  function join(parts){let out=new Uint8Array(parts.reduce((s,p)=>s+p.length,0)),offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;}
  function pngDpi(bytes,dpi){
    const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    if(b.length<33||b[0]!==137||b[1]!==80||b[2]!==78||b[3]!==71)throw Error('PNG encoding failed.');
    const density=Math.round(dpi/.0254),chunk=new Uint8Array(21),dv=new DataView(chunk.buffer);
    dv.setUint32(0,9);chunk.set([112,72,89,115],4);dv.setUint32(8,density);dv.setUint32(12,density);chunk[16]=1;dv.setUint32(17,crc32(chunk.subarray(4,17)));
    const parts=[b.subarray(0,8)];let p=8,inserted=false;
    while(p<b.length){if(p+12>b.length)throw Error('Truncated PNG chunk.');const size=new DataView(b.buffer,b.byteOffset+p,4).getUint32(0),end=p+12+size;if(end>b.length)throw Error('Truncated PNG data.');const type=String.fromCharCode(...b.subarray(p+4,p+8));if(type!=='pHYs')parts.push(b.subarray(p,end));if(type==='IHDR'){parts.push(chunk);inserted=true;}p=end;}
    if(!inserted)throw Error('Missing PNG image header.');return join(parts);
  }
  function jpegDpi(bytes,dpi){
    const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    if(b[0]!==255||b[1]!==216)throw Error('JPEG encoding failed.');
    const jfif=new Uint8Array([255,224,0,16,74,70,73,70,0,1,2,1,0,0,0,0,0,0]),v=new DataView(jfif.buffer);v.setUint16(12,dpi);v.setUint16(14,dpi);
    const parts=[b.subarray(0,2),jfif];let p=2;
    while(p+4<=b.length&&b[p]===255){const marker=b[p+1];if(marker===218||marker===217)break;const size=(b[p+2]<<8)|b[p+3],end=p+2+size;if(size<2||end>b.length)throw Error('Truncated JPEG marker.');const oldJFIF=marker===224&&String.fromCharCode(...b.subarray(p+4,p+9))==='JFIF\0';if(!oldJFIF)parts.push(b.subarray(p,end));p=end;}
    parts.push(b.subarray(p));return join(parts);
  }
  return {dimensions,pngDpi,jpegDpi};
})();
if(typeof module!=='undefined')module.exports={BootstrapViz,Publication};
