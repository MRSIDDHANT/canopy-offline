/* Canopy Offline v1 — original implementation, no third-party runtime. */
'use strict';
const Core = (() => {
const fonts=['Arial','Helvetica','Calibri','Times New Roman'];
function cleanTextStyle(style){
 if(!style||typeof style!=='object')return null;
 const result={};
 if(fonts.includes(style.family))result.family=style.family;
 if(Number.isFinite(style.size)&&style.size>=6&&style.size<=96)result.size=style.size;
 if(typeof style.color==='string'&&/^#[0-9a-f]{6}$/i.test(style.color))result.color=style.color;
 for(const key of ['bold','italic'])if(typeof style[key]==='boolean')result[key]=style[key];
 return Object.keys(result).length?result:null;
}
function parse(text) {
 text=text.replace(/^\uFEFF/,''); let i=0, nodes=[], stack=[], current=null, root=null, expect=true, done=false;
 const fail=m=>{throw Error(`${m} near character ${i+1}`)};
 const ws=()=>{while(/\s/.test(text[i]||'')&&i<text.length)i++};
 function comment(){let depth=1,s='';i++;while(i<text.length&&depth){let c=text[i++];if(c==='[')depth++;if(c===']')depth--;if(depth)s+=c;}if(depth)fail('Unclosed comment');return s;}
 function make(){const n={id:nodes.length,name:'',length:null,comments:[],children:[],parent:null,collapsed:false,color:null,highlight:null,displayName:null,labelVisible:null,labelStyle:null,labelPosition:'base'};nodes.push(n);if(stack.length){n.parent=stack.at(-1);n.parent.children.push(n)}else {if(root)fail('Multiple roots');root=n}return n}
 function label(){let s='';if(text[i]==="'"){i++;let closed=false;while(i<text.length){let c=text[i++];if(c==="'"){if(text[i]==="'"){s+="'";i++}else{closed=true;break}}else s+=c;}if(!closed)fail('Unclosed quoted label');return s;}while(i<text.length&&!/[\s(),:;\[\]]/.test(text[i]))s+=text[i++];return s;}
 while(i<text.length){ws();if(i>=text.length)break;let c=text[i];
  if(c==='['){const v=comment();if(current)current.comments.push(v);continue;}
  if(c==='('){if(!expect)fail('Unexpected opening parenthesis');current=make();stack.push(current);current=null;expect=true;i++;continue;}
  if(c===','){if(expect||!stack.length)fail('Unexpected comma');expect=true;current=null;i++;continue;}
  if(c===')'){if(expect||!stack.length)fail('Unexpected closing parenthesis');current=stack.pop();expect=false;i++;ws();if(i<text.length&&!/[,:;()\[\]]/.test(text[i]))current.name=label();continue;}
  if(c===':'){if(expect){current=make();expect=false;}if(current.length!==null)fail('Repeated branch length');i++;ws();let s='';while(i<text.length&&!/[\s,();\[\]]/.test(text[i]))s+=text[i++];if(!/^[+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)||!Number.isFinite(+s))fail('Invalid or negative branch length');current.length=+s;continue;}
  if(c===';'){if(expect||stack.length)fail('Incomplete tree');i++;done=true;break;}
  if(!expect)fail('Unexpected label');current=make();current.name=label();if(!current.name)fail('Empty label');expect=false;
 }
 if(!done||!root)fail('Expected a complete Newick tree ending with ;');
 ws();while(text[i]==='['){comment();ws();}if(i<text.length)fail('Only one tree per file is supported');
 return root;
}
function walk(root,visible=false){const out=[],stack=[root];while(stack.length){let n=stack.pop();out.push(n);if(!visible||!n.collapsed)for(let j=n.children.length-1;j>=0;j--)stack.push(n.children[j]);}return out;}
function index(root){const nodes=walk(root);for(const n of nodes.reverse())n.count=n.children.length?n.children.reduce((s,c)=>s+c.count,0):1;return nodes.reverse();}
const numericSupport=s=>/^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*$/.test(s||'');
function write(root,rename=null){let out=[],stack=[{n:root,close:false}];const quote=s=>!s?'':/[\s(),:;\[\]']/.test(s)?"'"+s.replace(/'/g,"''")+"'":s;
 while(stack.length){let x=stack.pop();if(x.comma){out.push(',');continue;}let n=x.n;if(!x.close&&n.children.length){out.push('(');stack.push({n,close:true});for(let j=n.children.length-1;j>=0;j--){stack.push({n:n.children[j],close:false});if(j>0)stack.push({comma:true});}continue;}
 if(x.close)out.push(')');out.push(quote(rename&&!n.children.length?rename(n):n.name));for(const c of n.comments||[])out.push('['+c+']');if(n.length!==null)out.push(':'+n.length);
 }return out.join('')+';';}
function snapshot(root){return {root:root.id,nodes:walk(root).map(n=>({id:n.id,name:n.name,length:n.length,comments:n.comments,children:n.children.map(c=>c.id),collapsed:n.collapsed,color:n.color,displayName:n.displayName??null,labelVisible:n.labelVisible??null,labelStyle:n.labelStyle?{...n.labelStyle}:null,labelPosition:n.labelPosition==='tip'?'tip':'base',highlight:n.highlight?{...n.highlight}:null}))};}
function cleanHighlight(h){return h&&typeof h.color==='string'&&/^#[0-9a-f]{6}$/i.test(h.color)&&Number.isFinite(h.opacity)&&h.opacity>=0&&h.opacity<=1?{color:h.color,opacity:h.opacity}:null;}
function restore(s){if(!s||!Array.isArray(s.nodes)||!s.nodes.length)throw Error('Invalid session tree');let map=new Map();for(const r of s.nodes){if(!Number.isInteger(r.id)||map.has(r.id)||typeof r.name!=='string'||!Array.isArray(r.children)||r.length!==null&&(!Number.isFinite(r.length)||r.length<0))throw Error('Invalid session node');map.set(r.id,{...r,displayName:typeof r.displayName==='string'&&r.displayName.trim()&&r.displayName.length<=1000?r.displayName:null,labelVisible:typeof r.labelVisible==='boolean'?r.labelVisible:null,labelStyle:cleanTextStyle(r.labelStyle),labelPosition:r.labelPosition==='tip'?'tip':'base',highlight:cleanHighlight(r.highlight),color:typeof r.color==='string'&&/^#[0-9a-f]{6}$/i.test(r.color)?r.color:null,children:[],parent:null,comments:Array.isArray(r.comments)?r.comments.map(String):[]});}
 for(const r of s.nodes){let n=map.get(r.id);for(const id of r.children){let c=map.get(id);if(!c||c.parent||c===n)throw Error('Invalid session edges');c.parent=n;n.children.push(c);}}
 let root=map.get(s.root);if(!root||root.parent)throw Error('Invalid session root');let seen=new Set(),stack=[root];while(stack.length){let n=stack.pop();if(seen.has(n))throw Error('Cycle in session');seen.add(n);stack.push(...n.children);}if(seen.size!==map.size)throw Error('Disconnected session');index(root);return root;}
function reroot(root,target){if(!target.parent)return root;if(root.children.length===1)throw Error('Rerooting a unary input root is not supported; remove the root stem first.');
 const nodes=walk(root),adj=new Map(nodes.map(n=>[n,[]]));for(const n of nodes)if(n.parent){let e={length:n.length,support:n.children.length&&numericSupport(n.name)?n.name:''};adj.get(n).push({n:n.parent,e});adj.get(n.parent).push({n,e});}
 let p=target.parent,edge=adj.get(target).find(x=>x.n===p).e;
 adj.set(target,adj.get(target).filter(x=>x.n!==p));adj.set(p,adj.get(p).filter(x=>x.n!==target));
 const nr={id:nodes.reduce((m,n)=>Math.max(m,n.id),0)+1,name:'',length:null,comments:[],children:[],parent:null,collapsed:false,color:null,highlight:null,displayName:null,labelVisible:null,labelStyle:null,labelPosition:'base'};
 adj.set(nr,[]);let half=edge.length===null?null:edge.length/2;
 for(const [n,support] of [[target,''],[p,edge.support]]){let e={length:half,support};adj.get(nr).push({n,e});adj.get(n).push({n:nr,e});}
 for(const n of nodes){n.children=[];n.parent=null;n.collapsed=false;if(n.children.length===0&&numericSupport(n.name)&&adj.get(n).length>1)n.name='';}
 const stack=[nr];while(stack.length){let n=stack.pop();for(const a of adj.get(n)){if(a.n===n.parent)continue;let c=a.n;c.parent=n;c.length=a.e.length;if(a.e.support&&adj.get(c).length>1)c.name=a.e.support;n.children.push(c);stack.push(c);}}
 // Suppress the old artificial degree-two root only if it carries no node metadata.
 if(root!==nr&&root.parent&&root.children.length===1&&!root.name&&!root.comments.length&&!root.highlight&&!root.displayName&&root.labelVisible==null&&!root.labelStyle&&root.labelPosition!=='tip'&&!root.color){let child=root.children[0],pa=root.parent;child.length=root.length===null||child.length===null?null:root.length+child.length;child.parent=pa;pa.children[pa.children.indexOf(root)]=child;}
 index(nr);return nr;
}
function layout(root,type='rect',lengths=true){let nodes=index(root),vis=walk(root,true),tips=vis.filter(n=>n.collapsed||!n.children.length);let max=0;
 root.dist=0;for(const n of vis){if(n!==root)n.dist=n.parent.dist+(lengths?(n.length??1):1);max=Math.max(max,n.dist);}max=max||1;
 tips.forEach((n,i)=>{n.order=i;});for(const n of [...vis].reverse())if(!n.collapsed&&n.children.length)n.order=(n.children[0].order+n.children.at(-1).order)/2;
 const span=Math.max(1,tips.length-1)*18;for(const n of vis){n.a=2*Math.PI*(n.order+.5)/Math.max(1,tips.length)-Math.PI/2;n.r=n.dist/max*600;if(type==='rect'){n.x=n.dist/max*1000;n.y=n.order*18;}else {n.x=n.r*Math.cos(n.a);n.y=n.r*Math.sin(n.a);}}
 if(type==='unrooted'){root.x=0;root.y=0;root.lo=0;root.hi=2*Math.PI;for(const n of vis){if(n.collapsed||!n.children.length)continue;let total=n.children.reduce((s,c)=>s+c.count,0),a=n.lo;for(const c of n.children){c.lo=a;c.hi=a+(n.hi-n.lo)*c.count/total;c.a=(c.lo+c.hi)/2;let d=(lengths?(c.length??1):1)/max*600;c.x=n.x+d*Math.cos(c.a);c.y=n.y+d*Math.sin(c.a);a=c.hi;}}}
 let segments=[];const seg=(x1,y1,x2,y2,n)=>segments.push({x1,y1,x2,y2,n});
 for(const n of vis){if(n===root)continue;let p=n.parent;if(type==='rect'){seg(p.x,p.y,p.x,n.y,n);seg(p.x,n.y,n.x,n.y,n);}else if(type==='circular'){let da=n.a-p.a,steps=Math.max(1,Math.ceil(Math.abs(da)*24));for(let j=0;j<steps;j++){let a=p.a+da*j/steps,b=p.a+da*(j+1)/steps;seg(p.r*Math.cos(a),p.r*Math.sin(a),p.r*Math.cos(b),p.r*Math.sin(b),n);}seg(p.r*Math.cos(n.a),p.r*Math.sin(n.a),n.x,n.y,n);}else seg(p.x,p.y,n.x,n.y,n);}
 return {nodes:vis,tips,segments,max,all:nodes};
}
function tsv(text){let rows=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell||quoted&&text[i+1]&&!/[\t\r\n]/.test(text[i+1]))cell+=c;else quoted=!quoted;}else if(!quoted&&(c==='\t'||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!=='\t'){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(Boolean))rows.push(row);row=[];}}else cell+=c;}if(quoted)throw Error('Unclosed quoted TSV field');row.push(cell);if(row.some(Boolean))rows.push(row);if(rows.length<2)throw Error('TSV needs a header and at least one row');const header=rows.shift().map(x=>x.replace(/^\uFEFF/,'').trim());return {header,rows};}
function compare(a,b){const ta=walk(a).filter(n=>!n.children.length),tb=walk(b).filter(n=>!n.children.length),names=ta.map(n=>n.name).sort();if(new Set(names).size!==names.length||new Set(tb.map(n=>n.name)).size!==tb.length)throw Error('Comparison requires unique tip IDs');let other=tb.map(n=>n.name).sort();if(names.length!==other.length||names.some((n,i)=>n!==other[i]))throw Error('Comparison requires exactly the same tip IDs (use original IDs)');const ids=new Map(names.map((n,i)=>[n,i])),full=(1n<<BigInt(names.length))-1n;
 function splits(root){let bits=new Map(),set=new Set();for(const n of walk(root).reverse()){let mask=0n,count=0;if(!n.children.length){mask=1n<<BigInt(ids.get(n.name));count=1;}else for(const c of n.children){mask|=bits.get(c).mask;count+=bits.get(c).count;}bits.set(n,{mask,count});if(n.parent&&count>1&&count<names.length-1){let complement=full^mask;set.add((mask<complement?mask:complement).toString(16));}}return set;}
 let sa=splits(a),sb=splits(b),common=0;for(const x of sa)if(sb.has(x))common++;let rf=sa.size+sb.size-2*common;return {tips:names.length,splitsA:sa.size,splitsB:sb.size,common,rf,normalized:sa.size+sb.size?rf/(sa.size+sb.size):0};}
return {parse,walk,index,write,snapshot,restore,reroot,layout,tsv,compare,fonts,cleanTextStyle};
})();
if(typeof module!=='undefined')module.exports=Core;
