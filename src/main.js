
import{RULES,SUITCH,suitOf,rankLabel,lineCells,linesOfCell,lineName,cellName,B3,eval5,handName,newGame,actor,raiseRange,bettingLegal,doPlace,doBet}from'./engine.js';
import{cpuMove}from'./cpu.js';
import{logText}from'./view.js';
import{startGuide,stopGuide}from'./guide.js';
import*as realNet from'./net.js';
let net=realNet; // replaced by src/fakeNet.js on http://localhost:5173/?fake (development only)

/* ---------------- UI ---------------- */
const $=s=>document.querySelector(s);
// ME / OP: seat indexes of you and your opponent. VS CPU: 0 / 1. VS Player: your seat comes from the server.
let ME=0,OP=1,MODE=null; // MODE: 'cpu' | 'pvp'
let PV=null;             // VS Player: {game, ver, offset (server clock - local clock)}
let G=null;
let ui={popIdx:0,busy:false,snap:null,push:[],stackHold:false,disp:null,cpuGen:-1,plate:null,holdUntil:0,lockUntil:0,sel:null,raiseTo:null,hover:null,showLine:null,lastLogLen:0,timer:null,flip:new Set(),handGen:-1,newCard:null,overShown:false};
const SUIT_JA=['スペード','ハート','ダイヤ','クラブ'];
const opTag=()=>MODE==='pvp'?'OPP':'CPU';
const opName=()=>MODE==='pvp'&&G&&G.meta?G.meta.names[OP]:'CPU';
const sc=p=>p===ME?0:1; // colour class: 0 = you (blue), 1 = opponent (orange)
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function cardHTML(c,opts={}){
  if(opts.back||c===null||c===undefined)return`<div class="card back" role="img" aria-label="相手のカード（見えない）"></div>`;
  const red=suitOf(c)===1||suitOf(c)===2,own=opts.owner===ME?' mine':opts.owner===OP?' theirs':'';
  return`<div class="card${red?' red':''}${own}${opts.dim?' dim':''}${opts.used?' used':''}" role="img" aria-label="${SUIT_JA[suitOf(c)]}の${rankLabel(c)}"><span class="rk">${rankLabel(c)}</span><span class="st">${SUITCH[suitOf(c)]}</span>${own?'<i class="own"></i>':''}</div>`;
}
function toast(t){const el=$('#toast');const r=$('#board').getBoundingClientRect();if(r.width){el.style.left=(r.left+r.width/2)+'px';el.style.top=Math.max(80,Math.min(innerHeight-80,r.top+r.height/2))+'px'}el.textContent=t;el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('show'),1800)}
const popup=()=>G&&ui.popIdx<G.popups.length?G.popups[ui.popIdx]:null;

const WS=p=>p===ME?'YOU':opTag();
const AV={'ベット':'bet','レイズ':'raise','コール':'call','チェック':'check','フォールド':'fold'};
const PL={bet:'BET',raise:'RAISE',call:'CALL',check:'CHECK',fold:'FOLD',place:'配置'};
const PLATE_MS=2400,HOLD_BET=1400,HOLD_PLACE=450,LOCK_MS=450;
// remember the opponent's newest action (from line histories that grew during the last step)
function noteCpu(ph,hb){
  const now=Date.now();let last=null;
  G.hist.forEach((h,L)=>{for(let i=hb[L];i<h.length;i++)if(h[i].p===OP)last={L,a:h[i].a,to:h[i].to}});
  if(last){
    const k=AV[last.a];ui.plate={k,amt:k==='check'||k==='fold'?null:last.to,L:last.L,t:now};ui.holdUntil=now+HOLD_BET;
    if(actor(G)===ME&&G.phase==='betting')ui.lockUntil=now+LOCK_MS;
  }else if(ph==='place'&&actor(G)!==null&&G.lastCell!==null&&G.board[G.lastCell]&&G.board[G.lastCell].owner===OP){
    ui.plate={k:'place',cell:G.lastCell,t:now};ui.holdUntil=now+HOLD_PLACE;
  }
}
// plate stays while you are facing that bet/raise; otherwise it shows for PLATE_MS
function plateOn(){
  const p=ui.plate;if(!p||!G||G.over)return null;
  if((p.k==='bet'||p.k==='raise')&&G.phase==='betting'&&G.betting.line===p.L&&actor(G)===ME&&G.contrib[p.L][OP]===p.amt)return p;
  return Date.now()-p.t<PLATE_MS?p:null;
}
function plateHTML(p){
  const ln=p.k==='place'?cellName(p.cell):lineName(p.L);
  return`<div class="plate k-${p.k}${Date.now()-p.t<250?' in':''}" data-t="${p.t}" role="status" aria-label="${opTag()} ${PL[p.k]}${p.amt!=null?' '+p.amt:''} ${ln}"><span class="chip-a k-${p.k}">${PL[p.k]}</span>${p.amt!=null?`<span class="pv">${p.amt}</span>`:''}<span class="pl">${ln}</span></div>`;
}
// your latest action on the line (shown in your panel while the opponent decides)
function myLast(L){const h=G.hist[L];for(let i=h.length-1;i>=0;i--)if(h[i].p===ME){const k=AV[h[i].a];return{k,amt:k==='check'||k==='fold'?null:h[i].to}}return null}
function lastAgg(L,p){const h=G.hist[L];for(let i=h.length-1;i>=0;i--)if(h[i].p===p&&(h[i].a==='ベット'||h[i].a==='レイズ'))return h[i].a;return null}
function lineState(L){
  const c=G.contrib[L],h=G.hist[L],inSd=G.phase==='betting'&&G.betting&&G.betting.line===L;
  if(G.pendingSd&&G.pendingSd.includes(L))return{who:null,tag:'SD pending',short:`SD pending ${c[0]+c[1]}`,next:'SD pending. Hands are shown after the other line closes.'};
  if(!inSd)return{who:null,tag:'',short:`ante ${c[0]}`,next:''};
  if(c[0]!==c[1]){
    const hi=c[ME]>c[OP]?ME:OP,lo=1-hi,act=AV[lastAgg(L,hi)]||'raise',tc=Math.min(c[hi]-c[lo],G.stacks[lo]);
    return{who:hi,tag:`${WS(hi)} ${act} ${c[hi]}`,short:`${WS(hi)} ${act} ${c[hi]}`,next:`${WS(lo)}：fold / call ${tc}${raiseRange(G,lo,L)?' / raise':''}`};
  }
  const ta=G.betting.toAct,next=`${WS(ta)}：check${raiseRange(G,ta,L)?' / bet':''}`;
  const last=h[h.length-1];
  if(last&&last.a==='チェック')return{who:last.p,tag:`${WS(last.p)} check`,short:`${WS(last.p)} check`,next};
  return{who:null,tag:'to act',short:'to act',next};
}
function histHTML(L){
  const h=G.hist[L],a=G.cfg.ante;
  return`<ol class="hist"><li class="sys"><b>ANTE</b><span>${a} / ${a}</span></li>${h.map(x=>`<li class="${x.p===ME?'y':'c'}"><b>${WS(x.p)}</b><span>${AV[x.a]||x.a}${x.a==='チェック'||x.a==='フォールド'?'':' '+x.to}</span></li>`).join('')}</ol>`;
}
function lineBox(L){
  if(L===null||L===undefined)return'';
  const c=G.contrib[L],d=G.done[L];
  let tail='';
  if(d)tail=`<div class="lb-res">${d.folded?`${WS(d.folder)} fold · ${WS(d.winner)} wins ${d.pot}`:`${d.names[ME]} vs ${d.names[OP]} · ${d.winner===null?'split':WS(d.winner)+' wins '+d.pot}`}</div>`;
  else{const n=lineState(L).next;if(n)tail=`<div class="lb-next">${n}</div>`}
  return`<div class="linebox"><div class="lb-top"><b>${lineName(L)}</b><span>pot ${d?d.pot:c[0]+c[1]}</span></div>
    <div class="lb-amt"><span class="y">YOU ${c[ME]}</span><span class="c">${opTag()} ${c[OP]}</span></div>${histHTML(L)}${tail}</div>`;
}
function showTip(L,anchor){
  const t=$('#tip');t.innerHTML=lineBox(L);t.hidden=false;ui.tipLine=L;
  const r=anchor.getBoundingClientRect(),w=t.offsetWidth,h=t.offsetHeight;
  let x=r.right+8,y=r.top;if(x+w>innerWidth-8)x=r.left-w-8;if(x<8)x=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2));
  if(x<8)x=8;if(r.right+8+w>innerWidth-8&&r.left-w-8<8)y=r.bottom+8;if(y+h>innerHeight-8)y=Math.max(8,innerHeight-h-8);
  t.style.left=x+'px';t.style.top=y+'px';
}
function hideTip(){const t=$('#tip');if(t){t.hidden=true;ui.tipLine=null}}

/* ---------- main screen ---------- */
function render(){
  if(!G)return;
  const placed=G.board.filter(x=>x).length;
  $('#roundLbl').innerHTML=`<span class="bar"><i style="transform:scaleX(${placed/25})"></i></span><b>${placed}</b><span>/ 25</span>`;
  $('#roundLbl').setAttribute('aria-label',`配置済み ${placed} / 25マス`);
  renderSeats();renderBoard();renderHand();renderDock();fitTable();
  const p=ui.plate;clearTimeout(ui.plateTimer);if(p&&plateOn()){const left=PLATE_MS-(Date.now()-p.t);if(left>0)ui.plateTimer=setTimeout(render,left+30)}
}
const inPlayOf=p=>G.contrib.reduce((s,c,L)=>s+(G.done[L]?0:c[p]),0);
const stackHTML=p=>`<span class="val">${Math.round(ui.disp?ui.disp[p]:G.stacks[p])}</span><span class="sub2">in pot ${inPlayOf(p)}</span>`;
const tagsHTML=p=>`${G.first===p?'<span class="pill">先手</span>':''}${G.stacks[p]===0&&!G.over?'<span class="pill allin">ALL-IN</span>':''}`;
const setHTML=(el,h)=>{if(el._h!==h){el.innerHTML=h;el._h=h;return true}return false};
function renderSeats(){
  const a=actor(G),live=!popup()&&!G.over,deal=ui.cpuGen!==G.handGen;ui.cpuGen=G.handGen;
  const sc=$('#seatCpu');sc.classList.toggle('off',live&&a===ME);
  const pl=plateOn();
  setHTML(sc,`<div class="who"><i class="gem" aria-hidden="true"></i><span class="nm">${esc(opName())}</span>${tagsHTML(OP)}</div>
    ${pl?plateHTML(pl):`<div class="mini-hand" aria-label="${opTag()} hand">${G.hands[OP].map(()=>cardHTML(null)).join('')}</div>`}
    <div class="stack" aria-label="${opTag()} stack">${stackHTML(OP)}</div>`);
  if(deal&&!REDUCE)sc.querySelectorAll('.mini-hand .card').forEach((c,i)=>c.animate([{transform:'translateY(-14px) rotate(-5deg)',opacity:0},{transform:'none',opacity:1}],{duration:400,delay:i*90,easing:EASE,fill:'backwards'}));
  $('#handRow').classList.toggle('off',live&&a===OP);
  setHTML($('#youWho'),`<div class="line"><i class="gem" aria-hidden="true"></i><span class="nm">あなた</span></div><div class="tags">${tagsHTML(ME)}</div>`);
  setHTML($('#youStack'),stackHTML(ME));
}
function hlSet(){
  const s=new Set();const pp=popup();
  if(pp){s.add(pp.L);return s}
  if(ui.hover!==null&&G.phase==='place'&&actor(G)===ME&&ui.sel!==null)linesOfCell(ui.hover).forEach(L=>s.add(L));
  if(G.phase==='betting')s.add(G.betting.line);
  if(G.over&&ui.showLine!==null)s.add(ui.showLine);
  return s;
}
const setCls=(el,c)=>{if(el.className!==c)el.className=c};
const setAttr=(el,k,v)=>{if(v==null){if(el.hasAttribute(k))el.removeAttribute(k)}else if(el.getAttribute(k)!==String(v))el.setAttribute(k,String(v))};
function buildBoard(){
  const pw=L=>`<div class="podwrap" data-pl="${L}"><button class="pod" data-line="${L}"><span class="face"></span></button><span class="tagslot"></span></div>`;
  const lab=(L,t)=>`<div class="lab" data-ll="${L}" aria-hidden="true">${t}</div>`;
  let h='';for(let c=5;c<10;c++)h+=pw(c);
  h+='<div></div><div class="corner"><span>POT</span><b></b></div>';
  for(let c=0;c<5;c++)h+=lab(5+c,'abcde'[c]);
  h+='<div></div><div></div>';
  for(let r=0;r<5;r++){for(let col=0;col<5;col++)h+=`<button class="cell" data-cell="${r*5+col}"></button>`;h+=lab(r,r+1)+pw(r)}
  const b=$('#board');b.innerHTML=h;
  const bd={cells:[...b.querySelectorAll('.cell')],pods:[],labs:[],corner:b.querySelector('.corner')};
  b.querySelectorAll('.podwrap').forEach(el=>{bd.pods[+el.dataset.pl]={wrap:el,pod:el.querySelector('.pod'),face:el.querySelector('.face'),tag:el.querySelector('.tagslot')}});
  b.querySelectorAll('.lab').forEach(el=>{bd.labs[+el.dataset.ll]=el});
  ui.bd=bd;
}
function renderBoard(){
  if(!ui.bd||!ui.bd.corner.isConnected)buildBoard();
  const bd=ui.bd,hl=hlSet(),hlCells=new Set();for(const L of hl)lineCells(L).forEach(c=>hlCells.add(c));
  const canPlace=G.phase==='place'&&actor(G)===ME&&ui.sel!==null&&!popup()&&!ui.busy;
  const bc=bestCombo();
  const pl=plateOn(),hotL=pl&&(pl.k==='bet'||pl.k==='raise')?pl.L:null,hotCells=new Set(hotL===null?[]:lineCells(hotL));
  for(let L=0;L<10;L++){
    const p=bd.pods[L],c=G.contrib[L],d=G.done[L];let cls='pod',face,tag='',lab;
    if(d){
      cls+=` done${d.winner!==null?' w'+sc(d.winner):''}`;face=d.pot;
      const t=d.folded?`${WS(d.folder)} fold`:d.winner===null?'split':`${WS(d.winner)} win`;
      tag=`<span class="ptag${d.winner!==null?' w'+sc(d.winner):''}">${t}</span>`;lab=`${lineName(L)}：${t}`;
    }else{
      face=c[0]+c[1];
      if(G.pendingSd.includes(L))tag='<span class="ptag">SD<span class="lg"> pending</span></span>';
      lab=`${lineName(L)}：pot ${face}`;
    }
    setCls(p.wrap,`podwrap${hl.has(L)?' hl':''}${L===hotL?' hot':''}`);setCls(p.pod,cls);
    if(p.face.textContent!==String(face))p.face.textContent=face;
    setHTML(p.tag,tag);setAttr(p.pod,'aria-label',lab);
    setCls(bd.labs[L],`lab${hl.has(L)?' hl':''}${L===hotL?' hot':''}`);
  }
  const live=G.contrib.reduce((s,c,L)=>s+(G.done[L]?0:c[0]+c[1]),0),cb=bd.corner.querySelector('b');
  if(cb.textContent!==String(live))cb.textContent=live;setAttr(bd.corner,'aria-label',`Total pot ${live}`);
  for(let cell=0;cell<25;cell++){
    const el=bd.cells[cell],b=G.board[cell];
    let cls='cell';if(hlCells.has(cell))cls+=' hl';if(hotCells.has(cell))cls+=' hot';if(bc&&bc.cells.includes(cell))cls+=bc.tri.includes(cell)?' best':' nobest';
    if(b&&b.rev)cls+=' rev';
    if(!b&&canPlace)cls+=' target';
    setCls(el,cls);
    setHTML(el,b?(b.owner===ME||b.rev?cardHTML(b.card,{owner:b.owner}):cardHTML(null)):'');
    setAttr(el,'aria-label',`${cellName(cell)}${b?(b.owner===ME?'：あなたのカード':b.rev?'：相手のカード（オープン）':'：相手のカード'):'：空き'}`);
    setAttr(el,'tabindex',!b&&canPlace?null:'-1');
  }
}
// one-shot effects on the board (Web Animations: later updates never replay them)
const EASE='cubic-bezier(.2,.8,.2,1)';
function cardAt(cell){return ui.bd&&ui.bd.cells[cell].querySelector('.card')}
function dropFx(cell){
  const c=cardAt(cell);if(!c)return;
  c.animate([{transform:'translateY(-6px) scale(1.04)',opacity:0},{transform:'none',opacity:1}],{duration:280,easing:EASE});
  const ink=getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()||'#000';
  ui.bd.cells[cell].animate([{boxShadow:`inset 0 0 0 2px ${ink}`},{boxShadow:'inset 0 0 0 1px transparent'}],{duration:1100,easing:'ease-out'});
}
function flipFx(cell,delay){
  const c=cardAt(cell);if(!c)return;
  c.animate([{transform:'perspective(600px) rotateY(90deg)'},{transform:'none'}],{duration:FLIP_MS,delay,easing:EASE,fill:'backwards'});
}
function applyHover(){
  const hl=hlSet(),hlCells=new Set();for(const L of hl)lineCells(L).forEach(c=>hlCells.add(c));
  document.querySelectorAll('#board .cell').forEach(el=>el.classList.toggle('hl',hlCells.has(+el.dataset.cell)));
  if(!ui.bd)return;
  document.querySelectorAll('#board .podwrap').forEach(el=>el.classList.toggle('hl',hl.has(+el.dataset.pl)));
  document.querySelectorAll('#board .lab').forEach(el=>el.classList.toggle('hl',hl.has(+el.dataset.ll)));
}
function bestCombo(){
  if(!G||G.phase!=='betting'||!G.betting)return null;
  const key=G.ver+':'+G.betting.line;if(ui.bestKey===key)return ui.best;
  const L=G.betting.line,cells=lineCells(L),board=cells.map(c=>G.board[c].card),hand=G.hands[ME];let v=-1,pair=null,tri=null;
  for(let a=0;a<hand.length;a++)for(let b=a+1;b<hand.length;b++)for(const[x,y,z]of B3){
    const e=eval5([hand[a],hand[b],board[x],board[y],board[z]]);if(e>v){v=e;pair=[hand[a],hand[b]];tri=[cells[x],cells[y],cells[z]]}}
  ui.bestKey=key;ui.best={L,v,name:handName(v),pair,tri,cells};return ui.best;
}
function renderHand(){
  const bc=bestCombo(),hand=G.hands[ME],box=$('#hand');
  const my=actor(G)===ME&&G.phase==='place'&&!popup()&&!ui.busy;
  const fresh=ui.handGen!==G.handGen;ui.handGen=G.handGen;
  const nd=G.lastDraw[ME],showNew=nd!==ui.seenDraw;ui.seenDraw=nd;
  let cap=box.querySelector('.best-cap');
  if(!cap){cap=document.createElement('div');cap.className='best-cap';cap.setAttribute('aria-live','polite');cap.hidden=true;box.appendChild(cap)}
  const old=[...box.querySelectorAll('.hcard')];
  if(fresh||old.length!==hand.length||old.some((b,i)=>+b.dataset.card!==hand[i])){
    const keep=new Map(fresh?[]:old.map(b=>[+b.dataset.card,b])),was=new Map();
    for(const[c,b]of keep)was.set(c,b.getBoundingClientRect().left);
    const nodes=hand.map(c=>{let b=keep.get(c);if(!b){b=document.createElement('button');b.className='hcard';b.dataset.card=c;b.innerHTML=cardHTML(c);b._deal=true}return b});
    for(const b of old)if(!nodes.includes(b))b.remove();
    nodes.forEach(b=>box.insertBefore(b,cap));
    if(!REDUCE)nodes.forEach((b,i)=>{
      const card=b.firstElementChild;
      if(b._deal){b._deal=false;if(fresh||(showNew&&+b.dataset.card===nd))card.animate([{transform:'translateY(-24px) rotate(-5deg)',opacity:0},{transform:'none',opacity:1}],{duration:450,delay:fresh?i*90+120:0,easing:EASE,fill:'backwards'});return}
      const dx=(was.get(+b.dataset.card)??0)-b.getBoundingClientRect().left;
      if(Math.abs(dx)>1)card.animate([{transform:`translateX(${dx}px)`},{transform:'none'}],{duration:260,easing:EASE});
    });
  }
  [...box.querySelectorAll('.hcard')].forEach((b,i)=>{
    const c=+b.dataset.card,best=bc&&bc.pair.includes(c);
    setCls(b,`hcard${bc?(best?' best':' nobest'):''}${ui.sel===c?' sel':''}`);
    b.disabled=!my;setAttr(b,'aria-pressed',String(ui.sel===c));setAttr(b,'aria-label',`Hand card ${i+1}${best?' (best)':''}`);
  });
  const ck=bc?bc.L+':'+bc.name:'';
  if(cap._k!==ck){
    cap._k=ck;cap.hidden=!bc;
    if(bc){cap.innerHTML=`<b>BEST</b>${bc.name}`;if(!REDUCE)cap.animate([{opacity:0,translate:'0 4px'},{opacity:1,translate:'0 0'}],{duration:300,easing:EASE})}
  }
}
function renderDock(){
  const el=$('#action');const a=actor(G),pp=popup();let top='',row='',idle=false;
  if(pp){
    top=`<span class="eyebrow">${lineName(pp.L)}</span><span class="dk-title">${pp.type==='fold'?'fold':'showdown'}</span>`;
    row=`<button class="btn primary" data-act="showres">結果</button>`;
  }else if(G.over){
    const w=G.winner;
    top=`<span class="eyebrow">GAME OVER</span><span class="dk-title ${w===null?'':w===ME?'y':'c'}">${w===null?'DRAW':WS(w)+' WIN'}</span><span class="dk-stats"><b class="y">${G.stacks[ME]}</b><b class="c">${G.stacks[OP]}</b></span>`;
    row=`<button class="btn ghost" data-act="results">結果</button>${MODE==='pvp'?'<button class="btn primary" data-act="menu">メニュー</button>':'<button class="btn primary" data-act="new">再戦</button>'}`;
  }else if(a===OP){
    idle=true;const mine=G.phase==='betting'?myLast(G.betting.line):null;
    top=mine?`<span class="eyebrow">${lineName(G.betting.line)}</span><span class="dk-title"><span class="chip-a me k-${mine.k}">${PL[mine.k]}</span>${mine.amt!=null?`<span class="dk-amt y">${mine.amt}</span>`:''}</span><span class="dots"><i></i><i></i><i></i></span>`
      :`<span class="eyebrow">${esc(opName())}</span><span class="dk-title">${G.phase==='betting'?lineName(G.betting.line)+' action':'考え中'}</span><span class="dots"><i></i><i></i><i></i></span>`;
  }else if(G.phase==='place'){
    idle=true;top=`<span class="eyebrow">YOUR TURN</span><span class="dk-title">${ui.sel===null?'カードを1枚選び、空きマスに置いてください':'置くマスを選んでください'}</span>`;
  }else if(G.phase==='betting'){
    const b=G.betting,L=b.line,lg=bettingLegal(G),c=G.contrib[L],pot=c[0]+c[1],facing=lg.mode==='facing';
    const title='<span class="you-act">YOUR ACTION</span>';
    const eff=Math.min(G.stacks[0]+c[0],G.stacks[1]+c[1]);
    const tip='Both lines completed. Showdown after both lines close.';
    const flag=G.queue.length>1?`<span class="flag" title="${tip}">+${lineName(G.queue[1])}</span>`:G.pendingSd.length?`<span class="flag" title="${tip}">${G.pendingSd.map(lineName).join(' · ')} SD pending</span>`:'';
    top=`<span class="eyebrow">${lineName(L)}</span><span class="dk-title">${title}</span>${flag}<span class="dk-stats">pot<b>${pot}</b>eff<b>${eff}</b></span>`;
    const rz=lg.raise?`<button class="btn accent" data-act="raiseOpen">${facing?'Raise':'Bet'}<small>${lg.raise[0]}${lg.raise[1]>lg.raise[0]?' – '+lg.raise[1]:''}</small></button>`:'';
    row=facing?`<button class="btn ghost" data-act="fold">Fold</button><button class="btn primary" data-act="call">Call<small>${lg.toCall}${lg.allin?' all-in':''}</small></button>${rz}`
      :`<button class="btn primary" data-act="check">Check</button>${rz}`;
  }
  el.classList.toggle('idle',idle);
  const lk=ui.lockUntil-Date.now();el.classList.toggle('lock',lk>0||ui.busy);if(lk>0){clearTimeout(ui.lockTimer);ui.lockTimer=setTimeout(renderDock,lk+20)}
  if(setHTML(el,idle?top+clockHTML():`<div class="dk-top">${top}${clockHTML()}</div><div class="dk-row">${row}</div>`))el._clk=null;
  const ck=clockKey();if(el._clk!==ck){el._clk=ck;el.querySelector(':scope>.clock')?.remove();const bar=clockBar();if(bar)el.insertAdjacentHTML('beforeend',bar)}
  tickClock();
}

/* ---------- modals ---------- */
const head=(eye,title,cls='')=>`<div class="eyebrow">${eye}</div><h2${cls?` class="${cls}"`:''}>${title}</h2>`;
function openDlg(id){const d=$(id);hideTip();if(!d.open)d.showModal()}
function sliderHTML(lo,hi,top,potAfter,verb){
  if(ui.raiseTo===null||ui.raiseTo<lo||ui.raiseTo>hi)ui.raiseTo=lo;
  // No Limit: the top button is all-in (or the most the opponent can cover); pot sizes are shortcuts below it
  const L=G.betting.line,allIn=G.contrib[L][ME]+G.stacks[ME],fit=v=>Math.min(hi,Math.max(lo,v));
  const qs=[['min',lo],['½ pot',fit(top+Math.floor(potAfter/2))],['pot',fit(top+potAfter)],[hi===allIn?'all-in':'max',hi]].filter((q,i,arr)=>arr.findIndex(x=>x[1]===q[1])===i);
  return`<div class="slider"><div class="slider-top"><span>${verb==='Raise'?'raise to':'bet'}</span><b id="rtv">${ui.raiseTo}</b></div>
    <input type="range" id="rto" min="${lo}" max="${hi}" step="1" value="${ui.raiseTo}" ${lo===hi?'disabled':''} aria-label="${verb} amount">
    <div class="quick">${qs.map(([k,v])=>`<button data-q="${v}" type="button" aria-pressed="${v===ui.raiseTo}">${k}<b>${v}</b></button>`).join('')}</div></div>`;
}
function fillRange(r){const lo=+r.min,hi=+r.max;r.style.setProperty('--fill',(hi>lo?(r.value-lo)/(hi-lo)*100:100)+'%')}
function syncRaise(){const a=$('#rtv'),b=$('#rtv2'),r=$('#rto');if(a)a.textContent=ui.raiseTo;if(b)b.textContent=ui.raiseTo;if(r){r.value=ui.raiseTo;fillRange(r)}document.querySelectorAll('.quick button').forEach(q=>q.setAttribute('aria-pressed',String(+q.dataset.q===ui.raiseTo)))}
function openRaise(){
  if(G.phase!=='betting'||actor(G)!==ME)return;
  const b=G.betting,L=b.line,lg=bettingLegal(G),c=G.contrib[L],pot=c[0]+c[1];if(!lg.raise)return;
  const facing=lg.mode==='facing',verb=facing?'Raise':'Bet';
  ui.raiseTo=null;
  $('#raiseBody').innerHTML=head(`${lineName(L)} · pot ${pot}`,verb)+
    sliderHTML(lg.raise[0],lg.raise[1],facing?c[OP]:c[ME],facing?pot+(c[OP]-c[ME]):pot,verb)+
    `<div class="btns"><button class="btn ghost" data-close type="button">キャンセル</button><button class="btn accent" data-act="raise" type="button">${verb}<small id="rtv2">${ui.raiseTo}</small></button></div>`;
  const r=$('#rto');fillRange(r);r.addEventListener('input',()=>{ui.raiseTo=+r.value;syncRaise()});
  openDlg('#raiseDlg');
}
function popupHTML(pp){
  const next=G.popups.length-ui.popIdx>1?'次へ':'続ける';
  if(pp.type==='fold')
    return head(`${lineName(pp.L)} · fold`,`${WS(pp.winner)} wins ${pp.pot}`,pp.winner===ME?'y':'c')+
      `<p class="sub">${WS(pp.folder)} fold · no show${pp.ret?` · uncalled ${pp.ret} returned`:''}</p><div class="btns"><button class="btn primary" data-act="ack" type="button">${next}</button></div>`;
  const w=pp.winner;
  const row=(p)=>`<span class="who2 ${p===ME?'y':'c'}">${WS(p)}</span><div class="row${p===OP?' c':''}">${pp.hands[p].map((c,i)=>`<span style="display:contents;--i:${i}">${cardHTML(c,{used:pp.pairs[p].includes(c),dim:!pp.pairs[p].includes(c)})}</span>`).join('')}<span class="hn late${w!==null&&w!==p?' lose':''}">${pp.names[p]}</span></div>`;
  return head(`${lineName(pp.L)} · showdown`,`<span class="late" style="display:inline-block">${w===null?`split ${pp.pot}`:`${WS(w)} wins ${pp.pot}`}</span>`,w===null?'e':w===ME?'y':'c')+
    `<div class="lineview">${pp.board.map(c=>cardHTML(c)).join('')}</div>
    <div class="sd">${row(ME)}${row(OP)}</div>
    <div class="btns"><button class="btn primary" data-act="ack" type="button">${next}</button></div>`;
}
function resultsHTML(){
  const rows=G.done.map((d,L)=>d).filter(Boolean);
  return`<ol class="results">${rows.map(d=>{
    const mine=d.contrib[ME];let amt,cls;
    if(d.winner===null){amt='±0';cls='even'}else if(d.winner===ME){amt='+'+(d.pot-mine);cls='up'}else{amt='−'+mine;cls='down'}
    const hd=d.folded?`${WS(d.folder)} fold`:`<span class="y${d.winner===OP?' lose':''}">${d.names[ME]}</span> vs <span class="c${d.winner===ME?' lose':''}">${d.names[OP]}</span>`;
    return`<li data-line="${d.L}" title="盤面で表示"><span class="ln">${lineName(d.L)}</span><span class="hd">${hd}</span><span class="amt ${cls}">${amt}</span></li>`}).join('')}</ol>`;
}
function openOver(){
  const w=G.winner,f=G.forfeit,res=MODE==='pvp'&&G.meta?G.meta.result:null;
  const why=f?`<p class="sub">${WS(f.p)} ${f.reason==='resign'?'resign':'time-out'}</p>`:G.bust!=null?`<p class="sub">${WS(G.bust)} stack 0</p>`:'';
  const rd=res?`<div class="rdelta">Rating<b>${res.after[ME]}</b><span class="${res.delta[ME]>0?'up':res.delta[ME]<0?'down':''}">${res.delta[ME]>0?'+':''}${res.delta[ME]}</span></div>`:'';
  $('#overBody').innerHTML=head('GAME OVER',w===null?'DRAW':WS(w)+' WIN',w===null?'e':w===ME?'y':'c')+why+
    `<div class="duel"><div class="y"><span>YOU</span><b>${G.stacks[ME]}</b></div><div class="c"><span>${esc(opName())}</span><b>${G.stacks[OP]}</b></div></div>${rd}${resultsHTML()}
    <div class="btns">${MODE==='pvp'?'<button class="btn primary" data-act="menu" type="button">メニュー</button>':'<button class="btn ghost" data-act="menu" type="button">メニュー</button><button class="btn primary" data-act="new" type="button">再戦</button>'}</div>`;
  openDlg('#overDlg');
}
function openLog(){
  $('#logBody').innerHTML=head('HAND HISTORY','ログ')+`<ol class="log">${G.log.slice(-300).map(e=>`<li class="${e.who==='sys'?'sys':'p'+sc(e.who)}">${esc(logText(e,ME,opTag()))}</li>`).join('')}</ol>`;
  openDlg('#logDlg');const l=$('#logBody .log');l.scrollTop=l.scrollHeight;
}
function openLine(L){
  const cards=lineCells(L).map(c=>{const b=G.board[c];return b?(b.owner===ME||b.rev?cardHTML(b.card,{owner:b.owner}):cardHTML(null)):'<div class="card empty"></div>'}).join('');
  $('#lineBody').innerHTML=head('LINE',lineName(L))+`<div class="lineview">${cards}</div>${lineBox(L)}`;
  openDlg('#lineDlg');
}
function syncModals(){
  const wait=ui.holdUntil-Date.now();
  if(wait>0&&(popup()||G.over)){clearTimeout(ui.holdTimer);ui.holdTimer=setTimeout(()=>{render();syncModals();schedule()},wait);return}
  const d=$('#resDlg'),pp=popup();
  const pk=pp?`${PV?PV.game:'cpu'}:${ui.popIdx}:${pp.type}:${pp.L}`:null;
  if(pp&&(!d.open||ui.popKey!==pk)){ui.popKey=pk;$('#resBody').innerHTML=popupHTML(pp);openDlg('#resDlg');if(pp.type==='showdown'&&!REDUCE){const bt=$('#resBody [data-act="ack"]');bt.disabled=true;setTimeout(()=>{bt.disabled=false;bt.focus()},1050)}}
  else if(!pp&&d.open){d.close();ui.popKey=null}
  if(!pp&&G.over&&!ui.overShown){ui.overShown=true;openOver()}
}

/* ---------- flow ---------- */
let prevRev=new Set(),prevOcc=new Set();
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLIP_STEP=110,FLIP_MS=500,SD_BEAT=850,PUSH_MS=650;
function afterChange(){
  ui.lastLogLen=G.log.length;
  const now=Date.now(),fresh=[];
  const rev=new Set();G.board.forEach((b,i)=>{if(b&&b.rev)rev.add(i)});for(const i of rev)if(!prevRev.has(i))fresh.push(i);prevRev=rev;
  const occ=new Set();G.board.forEach((b,i)=>{if(b)occ.add(i)});const placed=[...occ].filter(i=>!prevOcc.has(i));prevOcc=occ;
  fresh.sort((a,b)=>a-b);
  // board reveal: one card at a time, then a beat before anyone acts
  if(fresh.length&&!REDUCE){const beat=now+(Math.min(fresh.length,9)-1)*FLIP_STEP+FLIP_MS+300;ui.holdUntil=Math.max(ui.holdUntil,beat);if(actor(G)===ME)ui.lockUntil=Math.max(ui.lockUntil,beat)}
  const prev=ui.snap;ui.snap={contrib:G.contrib.map(c=>[...c]),done:G.done.map(d=>!!d),pops:G.popups.length};
  if(prev){
    // a new result: let the line sit for a moment before the result window
    if(ui.snap.pops>prev.pops&&!REDUCE)ui.holdUntil=Math.max(ui.holdUntil,now+SD_BEAT);
    // pots won go to the winner after the result window is closed
    G.done.forEach((d,L)=>{if(d&&!prev.done[L])ui.push.push({L,w:d.winner,pot:d.pot})});
    if(ui.push.length)ui.stackHold=true;
  }
  hideTip();render();
  if(!REDUCE){if(placed.length<=2)placed.filter(c=>!fresh.includes(c)).forEach(dropFx);if(fresh.length<=10)fresh.forEach((c,k)=>flipFx(c,k*FLIP_STEP))}
  // chips into the pot
  if(prev)for(let L=0;L<10;L++)for(const p of[ME,OP]){const d=ui.snap.contrib[L][p]-prev.contrib[L][p];if(d>0)fly(p===ME?'#youStack .val':'#seatCpu .stack .val',`#board .podwrap[data-pl="${L}"] .pod`,d,p)}
  if(!popup()&&ui.push.length)releasePush();else tweenStacks();
  syncModals();schedule();
}
function fly(fromSel,toSel,label,p,delay=0,done){
  const a=$(fromSel),b=$(toSel);
  if(REDUCE||!a||!b){done&&done();return}
  const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
  const el=document.createElement('div');el.className='fly '+(p===ME?'y':'c');el.textContent=label;document.body.appendChild(el);
  const w=el.offsetWidth,h=el.offsetHeight,x0=ra.left+ra.width/2-w/2,y0=ra.top+ra.height/2-h/2,x1=rb.left+rb.width/2-w/2,y1=rb.top+rb.height/2-h/2;
  const an=el.animate([
    {transform:`translate(${x0}px,${y0}px) scale(.8)`,opacity:0},
    {transform:`translate(${x0}px,${y0}px) scale(1)`,opacity:1,offset:.15},
    {transform:`translate(${x1}px,${y1}px) scale(1)`,opacity:1,offset:.85},
    {transform:`translate(${x1}px,${y1}px) scale(.7)`,opacity:0}],{duration:PUSH_MS,delay,easing:'cubic-bezier(.3,.7,.2,1)',fill:'both'});
  let ended=false;const end=()=>{if(ended)return;ended=true;el.remove();const t=$(toSel);if(t&&t.animate&&!document.hidden)t.animate([{transform:'scale(1)'},{transform:'scale(1.14)'},{transform:'scale(1)'}],{duration:280,easing:'ease-out'});done&&done()};
  an.onfinish=end;setTimeout(end,PUSH_MS+delay+150); // safety: hidden tabs pause animations
}
// pot -> winner, then the stacks count up
function releasePush(){
  const list=ui.push.splice(0);let n=0;
  const fin=()=>{if(++n>=list.length*2){ui.stackHold=false;tweenStacks()}};
  list.forEach((x,k)=>{
    const pod=`#board .podwrap[data-pl="${x.L}"] .pod`,dst=p=>p===ME?'#youStack .val':'#seatCpu .stack .val';
    if(x.w===null){fly(pod,dst(ME),Math.floor(x.pot/2),ME,k*120,fin);fly(pod,dst(OP),x.pot-Math.floor(x.pot/2),OP,k*120,fin)}
    else{fly(pod,dst(x.w),x.pot,x.w,k*120,fin);fin()}
  });
  if(!list.length){ui.stackHold=false;tweenStacks()}
  ui.holdUntil=Math.max(ui.holdUntil,Date.now()+PUSH_MS+list.length*120+250);
}
function tweenStacks(){
  if(ui.stackHold)return;
  if(!ui.disp)ui.disp=[...G.stacks];
  cancelAnimationFrame(ui.raf);
  const from=[...ui.disp],to=[...G.stacks],t0=performance.now(),D=REDUCE?0:520;
  const paint=()=>{const a=$('#seatCpu .stack .val'),b=$('#youStack .val');if(a)a.textContent=Math.round(ui.disp[OP]);if(b)b.textContent=Math.round(ui.disp[ME])};
  const step=t=>{const k=D?Math.min(1,(t-t0)/D):1,e=1-Math.pow(1-k,3);ui.disp=from.map((f,i)=>f+(to[i]-f)*e);paint();if(k<1)ui.raf=requestAnimationFrame(step)};
  if(document.hidden||!D){ui.disp=to;paint();return}
  ui.raf=requestAnimationFrame(step);
  clearTimeout(ui.tweenSafe);ui.tweenSafe=setTimeout(()=>{if(ui.disp.some((v,i)=>v!==to[i])&&String(to)===String(G.stacks)){cancelAnimationFrame(ui.raf);ui.disp=to;paint()}},D+250);
}
function schedule(){
  clearTimeout(ui.timer);
  if(MODE!=='cpu'||!G||G.over||popup())return;
  if(actor(G)!==OP)return;
  const wait=Math.max(0,ui.holdUntil-Date.now())+(G.phase==='betting'?1200:900);
  ui.timer=setTimeout(()=>{const ph=G.phase,hb=G.hist.map(h=>h.length);cpuMove(G,OP);ui.raiseTo=null;noteCpu(ph,hb);afterChange()},wait);
}
function resetTable(){
  prevRev=new Set();prevOcc=new Set();
  for(const id of['#resDlg','#overDlg','#raiseDlg','#lineDlg','#logDlg','#confirmDlg','#rulesDlg'])if($(id).open)$(id).close();
  clearTimeout(ui.timer);clearTimeout(ui.holdTimer);
  ui={...ui,popIdx:0,busy:false,snap:null,push:[],stackHold:false,disp:G?[...G.stacks]:null,cpuGen:-1,flipDelay:null,plate:null,holdUntil:0,lockUntil:0,sel:null,raiseTo:null,hover:null,showLine:null,lastLogLen:0,handGen:-1,overShown:false};
}
function startGame(){
  stopPvp();MODE='cpu';ME=0;OP=1;
  G=newGame(RULES);
  resetTable();showScreen('game');afterChange();
}

/* ---------- events ---------- */
$('#hand').addEventListener('click',e=>{const b=e.target.closest('.hcard');if(!b||b.disabled)return;const c=+b.dataset.card;ui.sel=ui.sel===c?null:c;render()});
$('#board').addEventListener('click',e=>{
  const cell=e.target.closest('.cell'),pod=e.target.closest('.pod');
  if(cell&&G.phase==='place'&&actor(G)===ME&&!popup()&&!ui.busy){
    const i=+cell.dataset.cell;if(G.board[i])return;
    if(ui.sel===null){toast('先にカードを1枚選ぶ');return}
    if(MODE==='pvp')return pvpMove({type:'place',card:ui.sel,cell:i});
    {const hb=G.hist.map(h=>h.length);doPlace(G,ME,ui.sel,i);noteCpu('mine',hb)}ui.sel=null;ui.hover=null;ui.raiseTo=null;
    return afterChange();
  }
  if(pod)openLine(+pod.dataset.line);
});
$('#board').addEventListener('pointerover',e=>{const cell=e.target.closest('.cell');const v=cell&&!G.board[+cell.dataset.cell]?+cell.dataset.cell:null;if(v!==ui.hover){ui.hover=v;applyHover()}});
$('#board').addEventListener('pointerleave',()=>{if(ui.hover!==null){ui.hover=null;applyHover()}hideTip()});
$('#board').addEventListener('pointerover',e=>{const pw=e.target.closest('.podwrap');if(e.pointerType==='touch')return;if(pw)showTip(+pw.dataset.pl,pw);else hideTip()});
$('#board').addEventListener('focusin',e=>{const cell=e.target.closest('.cell.target');const v=cell?+cell.dataset.cell:null;if(v!==ui.hover){ui.hover=v;applyHover()}});
document.addEventListener('click',e=>{
  if(e.target.closest('#menu'))return;
  const q=e.target.closest('[data-q]');if(q){ui.raiseTo=+q.dataset.q;syncRaise();return}
  const cl=e.target.closest('[data-close]');if(cl){cl.closest('dialog').close();return}
  const li=e.target.closest('.results li');if(li){ui.showLine=+li.dataset.line;$('#overDlg').close();render();return}
  const b=e.target.closest('[data-act]');if(!b||!G)return;const act=b.dataset.act;
  try{
    if(act==='new'){$('#overDlg').close();return startGame()}
    if(act==='menu'){$('#overDlg').close();return toMenu()}
    if(act==='results')return openOver();
    if(act==='showres')return syncModals();
    if(act==='ack'){ui.popIdx++;return afterChange()}
    if(['fold','call','check','raise','raiseOpen'].includes(act)&&(Date.now()<ui.lockUntil||ui.busy))return;
    if(act==='raiseOpen')return openRaise();
    if(G.phase==='betting'&&actor(G)===ME&&['fold','call','check','raise'].includes(act)){
      if(act==='raise')$('#raiseDlg').close();
      if(MODE==='pvp')return pvpMove({type:'bet',act,to:act==='raise'?ui.raiseTo:undefined});
      const hb=G.hist.map(h=>h.length);doBet(G,ME,act,ui.raiseTo);noteCpu('mine',hb);ui.raiseTo=null;return afterChange();
    }
  }catch(err){toast('その操作はできない');console.error(err)}
});
// 背景クリックで閉じる（決着モーダルは「続ける」で進める）
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d&&d.id!=='resDlg')d.close()}));
$('#resDlg').addEventListener('cancel',e=>{e.preventDefault();if(popup()){ui.popIdx++;afterChange()}});
$('#logBtn').addEventListener('click',openLog);
$('#themeToggle').addEventListener('click',()=>{
  const r=document.documentElement,cur=r.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),next=cur==='dark'?'light':'dark';
  r.dataset.theme=next;try{localStorage.setItem('gp-theme',next)}catch(e){}
  const t=$('#themeToggle');if(t.animate&&!REDUCE)t.animate([{transform:'rotate(0deg)'},{transform:'rotate(180deg)'}],{duration:500,easing:'cubic-bezier(.2,.8,.2,1)'});
});
$('#rulesBtn').addEventListener('click',()=>{openDlg('#rulesDlg');startGuide($('#guide'))});
$('#rulesDlg').addEventListener('close',stopGuide);
$('#menuBtn').addEventListener('click',onMenuBtn);
document.addEventListener('keydown',e=>{
  if(!G||MODE===null||ui.busy||document.querySelector('dialog[open]'))return;
  if(G.phase==='place'&&actor(G)===ME&&!popup()&&['1','2','3','4'].includes(e.key)){const c=G.hands[ME][+e.key-1];if(c!==undefined){ui.sel=ui.sel===c?null:c;render()}}
});

/* ---------- layout: fit the table to any screen ---------- */
// The largest cell size at which everything fits without scrolling is found by measuring the real layout.
// Portrait / desktop: one column. Landscape phones: board on the left, the rest on the right (body.side).
// Spare room then goes to the hand cards (--hw).
const CELL_MAX=84,CELL_MIN=18;
let fitKey='';
function fits(side,rows){
  const app=$('.app'),st=$('.stage');
  if(side){
    const cs=getComputedStyle(app),inner=app.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    if(app.scrollHeight>app.clientHeight+1||app.scrollWidth>app.clientWidth+1||$('#board').offsetHeight>inner)return false;
  }
  else if(st.scrollHeight>st.clientHeight||st.scrollWidth>st.clientWidth)return false;
  if(rows)for(const el of[$('#handRow'),$('#seatCpu')])if(el.scrollWidth>el.clientWidth+1)return false;
  return true;
}
function largest(lo,hi,set,side,rows){
  set(lo);if(!fits(side,rows))return lo;
  set(hi);if(fits(side,rows))return hi;
  while(hi-lo>.5){const m=(lo+hi)/2;set(m);if(fits(side,rows))lo=m;else hi=m}
  return Math.floor(lo*2)/2;
}
function fitTable(force){
  const b=document.body;
  if(b.dataset.screen!=='game'||!G)return;
  const app=$('.app'),st=$('.stage'),vw=app.clientWidth,vh=app.clientHeight,key=vw+'x'+vh;
  if(!force&&key===fitKey)return;
  fitKey=key;
  b.classList.add('measuring'); // top-aligned while measuring: overflow above a bottom-aligned stage is not counted by scrollHeight
  b.classList.toggle('compact',vw<640||vh<560);
  const setC=c=>st.style.setProperty('--cell',c+'px'),setH=w=>st.style.setProperty('--hw',w+'px');
  const run=side=>{b.classList.toggle('side',side);st.style.removeProperty('--hw');return largest(CELL_MIN,CELL_MAX,setC,side,side)}; // side: a wider board narrows the right column, so its rows must fit too
  let side=false,c=run(false);
  // two columns: landscape phones always when it helps; touch tablets when the board gets clearly bigger; never on a mouse desktop unless cramped
  const touch=matchMedia('(pointer:coarse)').matches||(import.meta.env.DEV&&/[?&]touch/.test(location.search));
  if(vw>vh*1.15&&(c<46||touch)){const cs=run(true);if(cs>c*(c<46?1.1:1.25)){side=true;c=cs}else run(false)}
  b.classList.toggle('side',side);setC(c);
  setH(largest(c*.84,c*(side?1.45:1.25),setH,side,true));
  b.classList.remove('measuring');
}
let fitT=0;
const refit=()=>{clearTimeout(fitT);fitT=setTimeout(()=>fitTable(true),50)};
addEventListener('resize',refit);
if(window.ResizeObserver)new ResizeObserver(refit).observe(document.querySelector('.app'));
addEventListener('orientationchange',refit);
if(window.visualViewport)visualViewport.addEventListener('resize',refit);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(refit);

/* ---------- screens ---------- */
function showScreen(n){document.body.dataset.screen=n;hideTip();if(n!=='game'){document.body.classList.remove('side','compact');fitKey=''}}
function toMenu(){
  stopPvp();MODE=null;clearTimeout(ui.timer);clearTimeout(ui.holdTimer);
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  showScreen('menu');if(user)refreshMe();
}
function onMenuBtn(){
  if(MODE==='pvp'&&G&&!G.over)return confirmBox('投了してメニューに戻る','投了',resign);
  toMenu();
}
function confirmBox(title,okLabel,onOk){
  $('#confirmBody').innerHTML=head('VS PLAYER',title)+`<div class="btns"><button class="btn ghost" data-close type="button">キャンセル</button><button class="btn primary" id="cfOk" type="button">${okLabel}</button></div>`;
  openDlg('#confirmDlg');$('#cfOk').onclick=()=>{$('#confirmDlg').close();onOk()};
}

/* ---------- VS Player: turn clock ---------- */
const TURN_MS=60000;
const srvNow=()=>Date.now()+(PV?PV.offset:0);
function clockLeft(){
  if(MODE!=='pvp'||!G||G.over||!G.meta||G.meta.deadline==null||actor(G)===null)return null;
  return Math.max(0,G.meta.deadline-srvNow());
}
function clockHTML(){return clockLeft()===null?'':'<span class="secs" id="secs"></span>'}
function clockKey(){return clockLeft()===null?null:`${G.meta.deadline}:${actor(G)}`}
function tickClock(){const el=$('#secs'),l=clockLeft();if(!el||l===null)return;const s=String(Math.ceil(l/1000));if(el.textContent!==s)el.textContent=s;el.classList.toggle('low',+s<=10)}
function clockBar(){
  const l=clockLeft();if(l===null)return'';
  return`<div class="clock ${actor(G)===ME?'me':'op'}" aria-hidden="true"><i style="--from:${(l/Math.max(TURN_MS,l)).toFixed(4)};animation-duration:${l}ms"></i></div>`;
}
setInterval(tickClock,250);

/* ---------- VS Player: game ---------- */
function stopPvp(){if(PV){clearTimeout(PV.t);PV.dead=true}PV=null}
function enterGame(id){
  stopLobby(false);stopPvp();
  PV={game:id,ver:-1,offset:0,t:null,dead:false,claiming:false};MODE='pvp';G=null;
  resetTable();showScreen('game');
  $('#action').className='dock idle';$('#action').innerHTML='<span class="dots"><i></i><i></i><i></i></span>';
  pvpPoll();
}
function applyView(v){
  if(!v||!PV||v.meta.game!==PV.game||v.meta.ver<=PV.ver)return;
  const first=!G,ph=G?G.phase:null,hb=G?G.hist.map(h=>h.length):null;
  ME=v.meta.seat;OP=1-ME;PV.ver=v.meta.ver;G=v;
  if(first){
    // resuming: do not replay old result windows or board flips
    ui.disp=[...G.stacks];ui.popIdx=G.popups.length;
    prevRev=new Set();prevOcc=new Set();G.board.forEach((b,i)=>{if(b){prevOcc.add(i);if(b.rev)prevRev.add(i)}});
  }else noteCpu(ph,hb);
  if(ui.sel!==null&&!G.hands[ME].includes(ui.sel))ui.sel=null;
  ui.raiseTo=null;
  afterChange();
}
async function pvpPoll(){
  const pv=PV;if(!pv||pv.dead)return;clearTimeout(pv.t);
  try{
    const r=await net.rpc('game_poll',{p_game:pv.game,p_ver:pv.ver});
    if(pv!==PV)return;
    pv.offset=r.now-Date.now();
    if(r.view&&!ui.busy)applyView(r.view);
    // the opponent is past their time: the server plays for them (check/fold or a random placement)
    if(G&&!G.over&&actor(G)===OP&&G.meta.deadline!=null&&srvNow()>G.meta.deadline+2000&&!pv.claiming){
      pv.claiming=true;
      try{const x=await net.game({op:'timeout',game:pv.game});if(PV===pv)applyView(x.view)}catch(e){}
      finally{pv.claiming=false}
    }
  }catch(e){
    if(pv!==PV)return;
    if(e.code==='not_found'){toast('ゲームが見つかりません');return toMenu()}
    if(e.code==='not_authenticated')return;
  }
  if(PV!==pv||(G&&G.over))return;
  const fast=!G||actor(G)===OP;
  pv.t=setTimeout(pvpPoll,document.hidden?4000:fast?1000:2500);
}
async function pvpMove(move){
  if(ui.busy||!PV)return;
  ui.busy=true;render();
  try{
    const r=await net.game({op:'act',game:PV.game,ver:PV.ver,move});
    ui.busy=false;ui.sel=null;ui.hover=null;applyView(r.view);
  }catch(e){
    ui.busy=false;
    if(['stale','not_your_turn','game_over'].includes(e.code))pvpPoll();
    else toast(e.code==='illegal'?'その操作はできない':'通信エラー。もう一度');
    render();
  }
}
async function resign(){
  if(!PV)return;
  try{const r=await net.game({op:'resign',game:PV.game});applyView(r.view)}
  catch(e){if(e.code==='game_over')pvpPoll();else toast('通信エラー。もう一度')}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(PV)pvpPoll();if(LB.on)lobbyTick()});

/* ---------- account ---------- */
let user=null,prof=null;
const GSVG='<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';
function renderAcct(){
  const el=$('#acct');
  $('#vsPlayer').disabled=!net.online;$('#rankBtn').disabled=!net.online;
  if(!net.online){el.innerHTML='';return}
  if(user&&prof)el.innerHTML=`<button class="who-me" id="meBtn" type="button" aria-label="Profile"><i class="gem" style="background:linear-gradient(135deg,#fff,var(--you) 65%)"></i>${esc(prof.nickname)}<span class="rt">${prof.rating}</span></button>`;
  else if(user)el.innerHTML='';
  else el.innerHTML=`<button class="gbtn" id="loginBtn" type="button">${GSVG}Google でログイン</button>`;
}
async function refreshMe(){
  try{prof=await net.rpc('me')}catch(e){if(e.code==='not_authenticated'){user=null;prof=null}}
  renderAcct();return prof;
}
async function login(after){
  try{const u=new URL(location.origin+'/');if(after)u.searchParams.set('after',after);await net.signIn(u.toString())}
  catch(e){toast('ログインを開始できませんでした')}
}
function openProfile(){
  if(!prof)return;
  $('#profBody').innerHTML=head('PROFILE','Nickname')+
    `<input class="tin" id="nickIn" maxlength="16" value="${esc(prof.nickname)}" autocomplete="off" spellcheck="false" aria-label="Nickname">
    <div class="err" id="nickErr" role="alert" hidden></div>
    <div class="stats"><span>Rating<b>${prof.rating}</b></span><span>W<b>${prof.wins}</b></span><span>L<b>${prof.losses}</b></span><span>D<b>${prof.draws}</b></span></div>
    <div class="btns"><button class="btn ghost" id="logoutBtn" type="button">ログアウト</button><button class="btn primary" id="nickSave" type="button">保存</button></div>`;
  openDlg('#profDlg');
}
async function saveNick(){
  const v=$('#nickIn').value.trim(),err=$('#nickErr');
  if(v===prof.nickname)return $('#profDlg').close();
  try{await net.rpc('set_nickname',{p_name:v});await refreshMe();$('#profDlg').close()}
  catch(e){err.hidden=false;err.textContent=e.code==='nickname_taken'?'その名前は使われています':e.code==='nickname_invalid'?'1〜16文字':'保存できませんでした'}
}
async function logout(){
  stopLobby(true);$('#profDlg').close();
  try{await net.signOut()}catch(e){}
  user=null;prof=null;renderAcct();
}

/* ---------- VS Player: lobby ---------- */
const LB={on:false,t:null,players:[],loaded:false,busy:false};
function renderLobby(){
  const el=$('#lobby'),b=$('#vsPlayer');
  b.classList.toggle('on',LB.on);b.setAttribute('aria-expanded',String(LB.on));
  b.innerHTML=LB.on?'VS Player<span class="st"><i class="pulse"></i>待機中</span>':'VS Player';
  el.hidden=!LB.on;if(!LB.on)return;
  el.innerHTML=!LB.loaded?'<div class="none"><span class="dots" style="justify-content:center"><i></i><i></i><i></i></span></div>'
    :LB.players.length?`<ol aria-label="待機中のプレイヤー">${LB.players.map(p=>`<li><span class="nm2">${esc(p.nickname)}</span><span class="rt">${p.rating}</span><button class="go" type="button" data-uid="${p.uid}">対戦</button></li>`).join('')}</ol>`
    :'<div class="none">待機中のプレイヤーはいません</div>';
}
async function lobbyTick(){
  if(!LB.on)return;clearTimeout(LB.t);
  try{
    const r=await net.rpc('lobby_poll',{p_wait:true});if(!LB.on)return;
    if(r.game)return enterGame(r.game);
    LB.players=r.players;LB.loaded=true;renderLobby();
  }catch(e){if(e.code==='not_authenticated')return stopLobby(false)}
  if(LB.on)LB.t=setTimeout(lobbyTick,document.hidden?5000:2000);
}
async function startLobby(){
  if(!user)return login('pvp');
  if(!prof&&!(await refreshMe()))return;
  if(prof.game)return enterGame(prof.game);
  LB.on=true;LB.loaded=false;LB.players=[];renderLobby();lobbyTick();
}
function stopLobby(tell){
  if(!LB.on)return;LB.on=false;clearTimeout(LB.t);renderLobby();
  if(tell)net.rpc('lobby_poll',{p_wait:false}).catch(()=>{});
}
async function challenge(btn){
  if(LB.busy)return;LB.busy=true;btn.disabled=true;
  try{const r=await net.game({op:'match',target:btn.dataset.uid});enterGame(r.game)}
  catch(e){toast(e.code==='gone'?'そのプレイヤーは対戦を始めました':'通信エラー。もう一度');lobbyTick()}
  finally{LB.busy=false}
}

/* ---------- ranking ---------- */
async function openRanking(){
  if(!user)return login('rank');
  const top=head('RANKING','Ranking');
  $('#rankBody').innerHTML=top+'<div class="empty-note"><span class="dots"><i></i><i></i><i></i></span></div>';openDlg('#rankDlg');
  try{
    const r=await net.rpc('ranking');
    const row=x=>`<li class="${x.me?'me':''}${x.rank===1?' top1':''}"><span class="rk">${x.rank}</span><span class="nm2">${esc(x.nickname)}</span><span class="rec">${x.wins}-${x.losses}${x.draws?'-'+x.draws:''}</span><span class="rt">${x.rating}</span></li>`;
    $('#rankBody').innerHTML=top+(r.top.length?`<ol class="rank">${r.top.map(row).join('')}</ol>`:'<div class="empty-note">まだ対戦記録がありません</div>')+
      (r.me&&!r.top.some(x=>x.me)?`<ol class="rank rank-me">${row({...r.me,me:true})}</ol>`:'');
  }catch(e){$('#rankBody').innerHTML=top+'<div class="empty-note">読み込めませんでした</div>'}
}

/* ---------- menu events ---------- */
$('#vsCpu').addEventListener('click',()=>{stopLobby(true);startGame()});
$('#vsPlayer').addEventListener('click',()=>LB.on?stopLobby(true):startLobby());
$('#rankBtn').addEventListener('click',openRanking);
$('#lobby').addEventListener('click',e=>{const b=e.target.closest('.go');if(b)challenge(b)});
$('#acct').addEventListener('click',e=>{if(e.target.closest('#loginBtn'))login('');else if(e.target.closest('#meBtn'))openProfile()});
$('#profDlg').addEventListener('click',e=>{if(e.target.closest('#nickSave'))saveNick();else if(e.target.closest('#logoutBtn'))logout()});
$('#profDlg').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='nickIn'){e.preventDefault();saveNick()}});
realNet.onSessionLost(()=>{user=null;prof=null;stopLobby(false);renderAcct();if(MODE==='pvp'){toMenu();toast('ログインし直してください')}});

/* ---------- boot ---------- */
async function boot(){
  if(import.meta.env.DEV&&new URLSearchParams(location.search).has('fake')){net=await import('./fakeNet.js');net.onSessionLost(()=>{})}
  showScreen('menu');renderAcct();renderLobby();
  if(!net.online)return;
  const u=new URL(location.href),after=u.searchParams.get('after');
  if(after!==null){u.searchParams.delete('after');history.replaceState(null,'',u.pathname+u.search+u.hash)}
  try{user=await net.currentUser()}catch(e){user=null}
  if(user)await refreshMe();else renderAcct();
  if(!user)return;
  if(prof&&prof.game)return enterGame(prof.game);
  if(after==='pvp')startLobby();
  if(after==='rank')openRanking();
}
boot();
// installable as an app (home screen). The worker caches nothing (public/sw.js)
if('serviceWorker' in navigator&&!import.meta.env.DEV)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
