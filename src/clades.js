/* Pure helpers for clade inspection and layout-aware background envelopes. */
'use strict';
const Clades = (() => {
  const tree = typeof module !== 'undefined' ? require('./core.js') : Core;
  function tips(node) { return tree.walk(node).filter(n => !n.children.length); }
  const cell = value => String(value ?? '').replace(/[\r\n\t]+/g, ' ');
  function labelsText(node, mode, metadata, display) {
    const leaves = tips(node);
    const rows = leaves.map(n => {
      const name = n.displayName ?? (metadata(n)?.label || n.name);
      if (mode === 'ids') return cell(n.name);
      if (mode === 'names') return cell(name);
      if (mode === 'tsv') return cell(n.name) + '\t' + cell(name);
      return cell(display(n));
    });
    return { count: leaves.length, text: (mode === 'tsv' ? 'id\tname\n' : '') + rows.join('\n') };
  }
  function prepare(scene, viewRoot) {
    // A preorder subtree is a contiguous interval. Cache intervals when layout
    // changes instead of traversing full descendant trees on every mouse move.
    const spans = new Map(scene.nodes.map((n, i) => [n, { start:i, end:i + 1 }]));
    for (let i = scene.nodes.length - 1; i >= 0; i--) {
      const n = scene.nodes[i], p = spans.get(n.parent);
      if (p) p.end = Math.max(p.end, spans.get(n).end);
    }
    const groups = [];
    for (let n = viewRoot.parent; n; n = n.parent) {
      if (n.highlight) groups.unshift({ owner:n, nodes:scene.nodes, tips:scene.tips });
    }
    for (const n of scene.nodes) if (n.highlight) {
      const span = spans.get(n), nodes = scene.nodes.slice(span.start, span.end);
      groups.push({ owner:n, nodes, tips:nodes.filter(x => x.collapsed || !x.children.length) });
    }
    return groups;
  }
  const num = x => Math.round(x * 100) / 100;
  function box(x, y, w, h, radius = 8) {
    const r = Math.min(radius, w/2, h/2), right=x+w, bottom=y+h;
    return `M${num(x+r)} ${num(y)}H${num(right-r)}Q${num(right)} ${num(y)} ${num(right)} ${num(y+r)}V${num(bottom-r)}Q${num(right)} ${num(bottom)} ${num(right-r)} ${num(bottom)}H${num(x+r)}Q${num(x)} ${num(bottom)} ${num(x)} ${num(bottom-r)}V${num(y+r)}Q${num(x)} ${num(y)} ${num(x+r)} ${num(y)}Z`;
  }
  function polygon(points) {
    return points.length ? points.map((p,i) => `${i?'L':'M'}${num(p.x)} ${num(p.y)}`).join('') + 'Z' : '';
  }
  function hull(points) {
    const sorted = points.slice().sort((a,b) => a.x-b.x || a.y-b.y);
    if (sorted.length < 3) return sorted;
    const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const lower=[], upper=[];
    for (const p of sorted) { while(lower.length>1 && cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop(); lower.push(p); }
    for (let i=sorted.length-1;i>=0;i--) { const p=sorted[i];while(upper.length>1 && cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p); }
    return lower.slice(0,-1).concat(upper.slice(0,-1));
  }
  function envelopes(groups, type, camera, options) {
    const at = n => ({x:n.x*camera.sx+camera.tx, y:n.y*camera.sy+camera.ty});
    const labelBox = n => {
      if(options.labelBox)return options.labelBox(n);
      const width=options.labelWidth(n);if(!width)return null;
      const p=at(n),x=type==='rect'&&options.align?1000*camera.sx+camera.tx:p.x;
      return {x:x+3,y:p.y-8,w:width+13,h:16};
    };
    const paths = [];
    for (const g of groups) {
      const style=g.owner.highlight;
      if (!style || !g.nodes.length) continue;
      const coords=g.nodes.map(at), xs=coords.map(p=>p.x), ys=coords.map(p=>p.y);
      let d='';
      if (type==='rect') {
        const padY=Math.max(4,Math.min(9,9*camera.sy));let left=Math.min(...xs)-9;
        let right=Math.max(...xs)+10;
        let top=Math.min(...ys)-padY,bottom=Math.max(...ys)+padY;
        for(const n of g.tips){const b=labelBox(n);if(b){left=Math.min(left,b.x);right=Math.max(right,b.x+b.w+5);top=Math.min(top,b.y);bottom=Math.max(bottom,b.y+b.h);}}
        if(options.trackRight!==null)right=Math.max(right,options.trackRight+8);
        d=box(left,top,Math.max(18,right-left),Math.max(8,bottom-top),8);
      } else if (type==='circular' && g.nodes.length>1) {
        // A sector encloses the clade without shading unrelated nodes across
        // the circle. Rounded label boxes join the sector in a single fill.
        const step=2*Math.PI/Math.max(1,options.tipCount);
        const angles=g.tips.map(n=>n.a), start=Math.min(...angles)-step*.46, end=Math.max(...angles)+step*.46;
        const radii=g.nodes.map(n=>n.r), inner=Math.max(0,Math.min(...radii)-8/camera.sx), outer=Math.max(...radii)+10/camera.sx;
        const points=[], steps=Math.max(2,Math.ceil((end-start)*36));
        for(let i=0;i<=steps;i++){const a=start+(end-start)*i/steps;points.push({x:camera.tx+outer*Math.cos(a)*camera.sx,y:camera.ty+outer*Math.sin(a)*camera.sy});}
        for(let i=steps;i>=0;i--){const a=start+(end-start)*i/steps;points.push({x:camera.tx+inner*Math.cos(a)*camera.sx,y:camera.ty+inner*Math.sin(a)*camera.sy});}
        d=polygon(points);
        for(const n of g.tips){const b=labelBox(n);if(b)d+=box(b.x,b.y,b.w,b.h,5);}
      } else {
        // Convex envelopes follow the radial clade and its horizontal labels.
        const points=[];
        for(const p of coords)for(const [dx,dy] of [[-7,-7],[7,-7],[7,7],[-7,7]])points.push({x:p.x+dx,y:p.y+dy});
        for(const n of g.tips){const b=labelBox(n);if(b)for(const [dx,dy] of [[0,0],[b.w,0],[b.w,b.h],[0,b.h]])points.push({x:b.x+dx,y:b.y+dy});}
        d=polygon(hull(points));
      }
      paths.push({node:g.owner, d, color:style.color, opacity:style.opacity});
    }
    return paths;
  }
  return {tips,labelsText,prepare,envelopes};
})();
if(typeof module!=='undefined')module.exports=Clades;
