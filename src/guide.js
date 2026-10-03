// Rules guide (rules modal): one looping animation per step on a miniature board, built from the same parts as the
// real table (.board / .cell / .pod / .card). The moves are scripted; hand strength comes from the engine, so the
// Showdown step always follows the real rules.
import{RANKCH,SUITCH,suitOf,rankLabel,eval5,bestHole,handName,B3,lineCells,cellName}from'./engine.js';

const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE='cubic-bezier(.2,.8,.2,1)';
const K=s=>RANKCH.indexOf(s[0])*4+SUITCH.indexOf(s[1]);
const ks=a=>a.map(K);
// the sample game's finished board: [card, owner] (0 = YOU, first player, 13 cards · 1 = OPP, 12 cards)
const FIN=[['A♠',1],['5♦',0],['J♣',1],['8♠',0],['3♥',1],
           ['6♥',0],['T♠',1],['2♦',0],['Q♣',1],['4♠',0],
           ['K♥',1],['7♠',0],['4♦',1],['9♣',0],['2♠',0],
           ['8♥',1],['3♦',0],['T♣',1],['5♠',0],['J♦',1],
           ['9♥',0],['6♣',1],['A♦',0],['4♥',1],['T♥',0]].map(([c,o])=>({c:K(c),o}));
const OPEN=[0,1,7,8,11,12,16];                 // cells filled when the sample starts
const L3=2,ROW3=lineCells(L3);                 // Line 3 (cells a3–e3) is the line the sample completes
// pots start empty: a line's ante is posted when the line completes. P3(n) = only Line 3 has a pot (n)
const P3=n=>{const a=Array(10).fill(null);a[L3]=n;return a};
// pots at the end of board 1 (Line 1–5, Line a–e) and who took them; the last two (Line 5, Line e) complete and are decided in the final step
// (YOU: 200 + 15 (Line 3) + 10 (the other lines) = 225 / OPP 175 before them; +10 +10 antes and both pots to YOU -> 235 / 165)
// (the last two, decided on screen: YOU holds J♥ 6♦ 8♣ + the drawn Q♥ -> Line 5 Flush Q-high beats OPP's Flush T-high, Line e One Pair JJ beats One Pair 22)
const END_POT=[10,70,30,30,10,10,50,10,40,10],END_W=[1,0,0,1,0,1,0,1,1,0];

const STEPS=[
  {t:'盤面と10本のline',p:'5×5の盤面で、行1〜5と列a〜eの10本のlineで勝負する。lineが完成すると両者がanteを出し、そのlineがpotになる（1盤面目は5）。',n:'マスは列＋行で a1〜e5 と呼ぶ。',run:stepBoard},
  {t:'置いて、引く',p:'自分の手番では、hand 4枚から1枚を空きマスに置き、すぐ1枚引く。handは常に4枚。',n:'置いたカードは、そのマスを通る行と列の2本のlineに入る。',run:stepPlace},
  {t:'伏せて置く',p:'置いたカードは、そのlineが完成するまで相手に見えない。相手のカードも裏向きのまま。',n:'カード右上の印：青は自分、オレンジは相手が置いたカード。',run:stepHidden},
  {t:'5枚でLine完成',p:'lineの5マスが埋まると完成。伏せていたカードがすべて表になり、board 5枚がそろう。両者がanteを出す。',run:stepComplete},
  {t:'Betting',p:'完成したlineで、anteのあとに1ラウンドだけbetting（No Limit：all-inまで）。完成させた側から先にaction。',n:'受けた側はcall／raise／fold。foldすると、handを見せずに相手がpotを取る。',run:stepBet},
  {t:'Showdown',p:'handから必ず2枚、boardから必ず3枚を使ったベスト5で比べ、強い方がpotを取る。同じ強さならsplit。',run:stepShowdown},
  {t:'Redeal',p:'lineが決着する（showdownかfold）たびに、両者のhandを山に戻し、4枚ずつ配り直す。',run:stepRedeal},
  {t:'次の盤面へ',p:'25マス埋まったら、stackを持ち越して次の盤面へ。anteは盤面ごとに2倍（5→10→20…）。',n:'先手・後手は盤面ごとに交代。2本同時に完成したら行→列の順にbetting。',run:stepEnd},
  {t:'手元が0になったら負け',p:'lineが決着した時点で手元が0なら、その場で負け。',n:'lineが完成したとき、anteが足りなければ、持っている分を置いてall-in。相手も同額を置く。',run:stepBust},
];

let ui=null,cur=0,tok=0,anims=[];
const STOP=Symbol('stop');

/* ---------- drawing ---------- */
function card(c,face,o){
  if(!face)return'<div class="card back"></div>';
  const red=suitOf(c)===1||suitOf(c)===2,own=o===0?' mine':o===1?' theirs':'';
  return`<div class="card${red?' red':''}${own}"><span class="rk">${rankLabel(c)}</span><span class="st">${SUITCH[suitOf(c)]}</span>${own?'<i class="own"></i>':''}</div>`;
}
const chip=(p,k,amt)=>`<span class="g-act"><span class="g-w${p}">${p?'OPP':'YOU'}</span><span class="chip-a${p?'':' me'} k-${k}">${k.toUpperCase()}</span>${amt!=null?`<b>${amt}</b>`:''}</span>`;
function build(root){
  const pw=L=>`<div class="podwrap" data-pl="${L}"><div class="pod"><span class="face"></span></div></div>`;
  const lab=(L,t)=>`<div class="lab" data-ll="${L}">${t}</div>`;
  let b='';for(let c=5;c<10;c++)b+=pw(c);
  b+='<div></div><div class="corner"><span>POT</span><b></b></div>';
  for(let c=0;c<5;c++)b+=lab(5+c,'abcde'[c]);
  b+='<div></div><div></div>';
  for(let r=0;r<5;r++){for(let c=0;c<5;c++)b+=`<div class="cell"></div>`;b+=lab(r,r+1)+pw(r)}
  const row=(p)=>`<div class="g-row g-p${p}"><span class="g-who"><i></i>${p?'OPP':'YOU'}</span><div class="g-hand"></div><b class="g-stk"></b></div>`;
  const n2=i=>String(i).padStart(2,'0');
  root.innerHTML=`<div class="g-stage" aria-hidden="true"><div class="g-scene">${row(1)}<div class="board g-board">${b}</div><div class="g-strip"></div>${row(0)}</div></div>
<div class="g-caps" aria-live="polite">${STEPS.map((s,i)=>`<div class="g-cap" data-i="${i}"><div class="g-num">${n2(i+1)} / ${n2(STEPS.length)}</div><h3>${s.t}</h3><p>${s.p}</p>${s.n?`<p class="g-n">${s.n}</p>`:''}</div>`).join('')}</div>
<div class="g-nav"><button class="g-btn prev" type="button" aria-label="前へ"></button><div class="g-segs">${STEPS.map((s,i)=>`<button class="g-seg" type="button" data-i="${i}" aria-label="${i+1}. ${s.t}"></button>`).join('')}</div><button class="g-btn next" type="button" aria-label="次へ"></button></div>`;
  const q=s=>[...root.querySelectorAll(s)];
  ui={root,stage:root.querySelector('.g-stage'),scene:root.querySelector('.g-scene'),cells:q('.g-board .cell'),labs:[],pods:[],
    corner:root.querySelector('.corner b'),strip:root.querySelector('.g-strip'),
    hands:[root.querySelector('.g-p0 .g-hand'),root.querySelector('.g-p1 .g-hand')],stks:[root.querySelector('.g-p0 .g-stk'),root.querySelector('.g-p1 .g-stk')],
    caps:q('.g-cap'),segs:q('.g-seg'),prev:root.querySelector('.prev'),next:root.querySelector('.next')};
  q('.g-board .lab').forEach(el=>{ui.labs[+el.dataset.ll]=el});
  q('.g-board .podwrap').forEach(el=>{ui.pods[+el.dataset.pl]={wrap:el,pod:el.querySelector('.pod'),face:el.querySelector('.face')}});
  ui.prev.addEventListener('click',()=>go(cur-1));
  ui.next.addEventListener('click',()=>go(cur+1));
  ui.segs.forEach(s=>s.addEventListener('click',()=>go(+s.dataset.i)));
  // swipe left / right on the animation
  let sx=null,sy=0;
  ui.stage.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY});
  ui.stage.addEventListener('pointerup',e=>{if(sx===null)return;const dx=e.clientX-sx,dy=e.clientY-sy;sx=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5)go(cur+(dx<0?1:-1))});
  ui.stage.addEventListener('pointercancel',()=>{sx=null});
}

// scene state
const S={pots:null,done:null};
function setCell(i,v){ui.cells[i].innerHTML=v?card(v.c,v.face,v.o):''}
function setHand(p,cs,face){ui.hands[p].innerHTML=cs.map(c=>`<div class="g-hc">${card(c,face||p===0)}</div>`).join('')}
function setPot(L,v,w){S.pots[L]=v;S.done[L]=w??null;const p=ui.pods[L];p.face.textContent=v==null?'':v;p.pod.className='pod'+(w!=null?` done w${w}`:'');corner()}
function corner(){ui.corner.textContent=S.pots.reduce((s,v,L)=>s+(v!=null&&S.done[L]==null?v:0),0)}
function hl(lines){
  const on=new Set();for(const L of lines)lineCells(L).forEach(c=>on.add(c));
  ui.cells.forEach((el,i)=>el.classList.toggle('hl',on.has(i)));
  ui.labs.forEach((el,L)=>el.classList.toggle('hl',lines.includes(L)));
  ui.pods.forEach((p,L)=>p.wrap.classList.toggle('hl',lines.includes(L)));
}
const stack=(p,v)=>{ui.stks[p].textContent=v};
const strip=h=>{ui.strip.innerHTML=h};
function scene(s){
  for(let i=0;i<25;i++){const f=s.cells.includes(i)?FIN[i]:null;setCell(i,f&&{...f,face:f.o===0||(s.rev||[]).includes(i)})}
  ui.cells.forEach(el=>el.className='cell');
  S.pots=[...(s.pots||Array(10).fill(null))];S.done=[...(s.done||Array(10).fill(null))];
  for(let L=0;L<10;L++)setPot(L,S.pots[L],S.done[L]);
  setHand(0,s.hands?s.hands[0]:[]);setHand(1,s.hands?s.hands[1]:[],s.opFace);
  stack(0,s.stacks?s.stacks[0]:'');stack(1,s.stacks?s.stacks[1]:'');
  hl(s.hl||[]);strip(s.strip||'');
}

/* ---------- timing ---------- */
function ctx(){
  // effects that are started without await (pulses, rings, fades) must not report the stop as an unhandled rejection
  const t=tok,ok=()=>{if(t!==tok)throw STOP},quiet=p=>{p.catch(()=>{});return p};
  return{ok,
    wait:ms=>quiet(new Promise(r=>setTimeout(r,REDUCE?0:ms)).then(ok)),
    anim:(el,kf,o)=>quiet(animate(el,kf,o)),
  };
  function animate(el,kf,o){if(REDUCE)return Promise.resolve().then(ok);const a=el.animate(kf,o);anims.push(a);a.finished.then(()=>{if(!o.fill){const k=anims.indexOf(a);if(k>=0)anims.splice(k,1)}},()=>{});return a.finished.then(ok,ok)}
}
function halt(){tok++;for(const a of anims)a.cancel();anims=[];if(ui){ui.stage.querySelectorAll('.g-ghost').forEach(g=>g.remove());ui.scene.style.opacity=''}}

// motions
const slot=(p,i)=>ui.hands[p].children[i];
const cardIn=(x,el,delay=0)=>x.anim(el,[{transform:'translateY(-14px) rotate(-5deg)',opacity:0},{transform:'none',opacity:1}],{duration:400,delay,easing:EASE,fill:'backwards'});
async function fly(x,from,to,html){
  const S0=ui.stage.getBoundingClientRect(),a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
  const g=document.createElement('div');g.className='g-ghost';g.innerHTML=html;ui.stage.append(g);
  const w=g.offsetWidth,h=g.offsetHeight;
  const x0=a.left-S0.left+(a.width-w)/2,y0=a.top-S0.top+(a.height-h)/2,x1=b.left-S0.left+(b.width-w)/2,y1=b.top-S0.top+(b.height-h)/2;
  g.style.left=x0+'px';g.style.top=y0+'px';from.style.visibility='hidden';
  try{await x.anim(g,[{transform:'none'},{transform:`translate(${x1-x0}px,${y1-y0}px)`}],{duration:520,easing:EASE,fill:'forwards'})}
  finally{g.remove()}
}
// a hand card leaves: the cards to its right slide over (FLIP)
async function closeGap(x,p,el){
  const rest=[...ui.hands[p].children].filter(c=>c!==el),before=rest.map(c=>c.getBoundingClientRect().left);
  el.remove();
  await Promise.all(rest.map((c,i)=>{const dx=before[i]-c.getBoundingClientRect().left;return dx?x.anim(c,[{transform:`translateX(${dx}px)`},{transform:'none'}],{duration:300,easing:EASE}):null}));
}
async function draw(x,p,c){
  ui.hands[p].insertAdjacentHTML('beforeend',`<div class="g-hc">${card(c,p===0)}</div>`);
  await cardIn(x,ui.hands[p].lastElementChild);
}
function ring(x,i,color){
  const v=getComputedStyle(document.documentElement).getPropertyValue(color).trim()||'#000';
  x.anim(ui.cells[i],[{boxShadow:`inset 0 0 0 2px ${v}`},{boxShadow:'inset 0 0 0 1px transparent'}],{duration:1100,easing:'ease-out'});
}
async function place(x,p,hi,cell){
  const from=slot(p,hi),f=FIN[cell],face=p===0;
  from.classList.add('sel');await x.wait(p===0?650:450);
  await fly(x,from,ui.cells[cell],card(f.c,face,f.o));
  setCell(cell,{...f,face});ring(x,cell,p===0?'--you':'--cpu');
  ui.cells.forEach(el=>el.classList.remove('target'));
  await closeGap(x,p,from);
}
function flip(x,cell,delay){
  const f=FIN[cell];setCell(cell,{...f,face:true});
  return x.anim(ui.cells[cell].firstElementChild,[{transform:'perspective(600px) rotateY(90deg)'},{transform:'none'}],{duration:500,delay,easing:EASE,fill:'backwards'});
}
function pulse(x,el){return x.anim(el,[{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:420,easing:'ease-out'})}
async function setStack(x,p,v){stack(p,v);await pulse(x,ui.stks[p])}
function addStrip(x,h){ui.strip.insertAdjacentHTML('beforeend',h);return x.anim(ui.strip.lastElementChild,[{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:260,easing:EASE})}
async function potTo(x,L,v,w){setPot(L,v,w);await pulse(x,ui.pods[L].pod)}

/* ---------- steps ---------- */
const HAND0=ks(['K♠','9♣','7♦','2♠']),OPH=ks(['Q♠','Q♥','9♦','5♣']),SD0=ks(['K♠','7♦','Q♦','3♣']);
const NEW0=ks(['J♥','T♥','6♦','8♣']),NEW1=ks(['A♣','7♥','K♣','2♥']);
const hand=(a,drop,add)=>[...a.filter(c=>c!==K(drop)),K(add)];
const H1=hand(HAND0,'9♣','Q♦');                 // after placing 9♣ and drawing Q♦
async function stepBoard(x){
  scene({cells:[],stacks:[200,200]});
  await x.wait(500);
  setHand(0,HAND0);setHand(1,OPH);
  await Promise.all([...ui.hands[0].children,...ui.hands[1].children].map((el,i)=>cardIn(x,el,(i%4)*90+(i>3?40:0))));
  await x.wait(1000);
  for(let L=0;L<10;L++){
    hl([L]);const cs=lineCells(L).map(cellName).join(' ');
    strip(`<span class="g-line"><b>Line ${L<5?L+1:'abcde'[L-5]}</b>${cs}</span>`);
    await x.wait(L===4?700:520);
  }
  hl([]);strip('');await x.wait(1400);
}
async function stepPlace(x){
  scene({cells:OPEN,hands:[HAND0,OPH],stacks:[200,200]});
  await x.wait(700);
  ui.cells[13].classList.add('target');hl([L3,8]);
  await place(x,0,1,13);hl([]);
  addStrip(x,`<span class="g-act"><span class="g-w0">YOU</span><span class="chip-a me k-check">PLACE</span><b>d3</b></span>`);
  await x.wait(250);await draw(x,0,K('Q♦'));
  await addStrip(x,`<span class="g-act"><span class="g-w0">YOU</span><span class="chip-a me k-check">DRAW</span><b>Q♦</b></span>`);
  await x.wait(2000);
}
async function stepHidden(x){
  scene({cells:[...OPEN,13],hands:[H1,OPH],stacks:[200,200]});
  await x.wait(700);
  await place(x,1,2,10);
  addStrip(x,`<span class="g-act"><span class="g-w1">OPP</span><span class="chip-a k-check">PLACE</span><b>a3</b></span>`);
  await x.wait(250);await draw(x,1,K('9♦'));
  await x.wait(500);await pulse(x,ui.cells[10].firstElementChild);await x.wait(250);await pulse(x,ui.cells[12].firstElementChild);
  await x.wait(1800);
}
const PRE4=[...OPEN,10,13];
async function stepComplete(x){
  scene({cells:PRE4,hands:[H1,OPH],stacks:[200,200],hl:[L3]});
  await x.wait(800);
  ui.cells[14].classList.add('target');
  await place(x,0,2,14);
  await x.wait(250);
  await Promise.all([flip(x,10,0),flip(x,12,110)]);
  strip(`<span class="g-line"><b>Line 3</b>完成 · board 5枚</span>`);
  await x.anim(ui.strip.firstElementChild,[{opacity:0},{opacity:1}],{duration:260});
  await x.wait(500);
  // both post the ante (5) for the completed line
  await Promise.all([setStack(x,0,195),setStack(x,1,195),potTo(x,L3,10)]);
  await x.wait(500);await draw(x,0,K('3♣'));
  await x.wait(2000);
}
const POST4=[...PRE4,14];
async function stepBet(x){
  scene({cells:POST4,rev:[10,12],hands:[SD0,OPH],pots:P3(10),stacks:[195,195],hl:[L3]});
  await x.wait(900);
  await addStrip(x,chip(0,'bet',10));stack(0,185);await potTo(x,L3,20);
  await x.wait(1100);
  await addStrip(x,chip(1,'call',10));stack(1,185);await potTo(x,L3,30);
  await x.wait(2200);
}
// best 5 for a hand on Line 3: the 2 hand cards and the 3 board cells that make it
function best(h){
  const bc=ROW3.map(i=>FIN[i].c),r=bestHole(bc,h);
  let cells=null;for(const t of B3){const v=eval5([...r.pair,...t.map(i=>bc[i])]);if(v===r.v){cells=t.map(i=>ROW3[i]);break}}
  return{name:handName(r.v),v:r.v,pair:r.pair,cells};
}
function markBest(p,b){
  ui.cells.forEach((el,i)=>{const on=ROW3.includes(i);el.classList.toggle('best',on&&b.cells.includes(i));el.classList.toggle('nobest',on&&!b.cells.includes(i));el.classList.toggle('o',p===1)});
  [...ui.hands[p].children].forEach((el,i)=>{const c=(p===0?SD0:OPH)[i],on=b.pair.includes(c);el.classList.toggle('best',on);el.classList.toggle('nob',!on);el.classList.toggle('o',p===1)});
}
function clearBest(){ui.cells.forEach(el=>el.classList.remove('best','nobest','o'));ui.root.querySelectorAll('.g-hc').forEach(el=>el.classList.remove('best','nob','o'))}
async function stepShowdown(x){
  const me=best(SD0),op=best(OPH),w=me.v===op.v?null:me.v>op.v?0:1;
  scene({cells:POST4,rev:[10,12],hands:[SD0,OPH],pots:P3(30),stacks:[185,185],hl:[L3]});
  await x.wait(700);
  setHand(1,OPH,true);await Promise.all([...ui.hands[1].children].map((el,i)=>x.anim(el.firstElementChild,[{transform:'perspective(600px) rotateY(90deg)'},{transform:'none'}],{duration:500,delay:i*110,easing:EASE,fill:'backwards'})));
  await x.wait(500);
  markBest(0,me);await addStrip(x,`<span class="g-act"><span class="g-w0">YOU</span><span class="g-hn">${me.name}</span></span>`);
  await x.wait(1700);
  clearBest();markBest(1,op);await addStrip(x,`<span class="g-act"><span class="g-w1">OPP</span><span class="g-hn">${op.name}</span></span>`);
  await x.wait(1700);
  clearBest();hl([]);
  strip(w===null?`<span class="g-act"><span class="g-hn">SPLIT</span><b>30</b></span>`:`<span class="g-act"><span class="g-w${w}">${w?'OPP':'YOU'}</span><span class="g-hn">WIN</span><b>+30</b></span>`);
  await Promise.all([potTo(x,L3,30,w??undefined),w===null?null:setStack(x,w,215)]);
  await x.wait(2000);
}
async function stepRedeal(x){
  scene({cells:POST4,rev:[10,12],hands:[SD0,OPH],opFace:true,pots:P3(30),done:[null,null,0,null,null,null,null,null,null,null],stacks:[215,185]});
  await x.wait(900);
  // both hands go back to the deck (the middle of the board), then 4 new cards each
  const mid=ui.cells[12].getBoundingClientRect();
  await Promise.all([...ui.hands[0].children,...ui.hands[1].children].map((el,i)=>{const r=el.getBoundingClientRect();
    return x.anim(el,[{transform:'none',opacity:1},{transform:`translate(${mid.left+mid.width/2-r.left-r.width/2}px,${mid.top+mid.height/2-r.top-r.height/2}px) scale(.6)`,opacity:0}],{duration:520,delay:(i%4)*60,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'})}));
  setHand(0,[]);setHand(1,[]);
  strip(`<span class="g-line"><b>Redeal</b>4枚ずつ</span>`);
  await x.wait(350);
  setHand(0,NEW0);setHand(1,NEW1);
  await Promise.all([...ui.hands[0].children,...ui.hands[1].children].map((el,i)=>cardIn(x,el,(i%4)*90+(i>3?40:0))));
  await x.wait(2000);
}
async function stepEnd(x){
  const all=[...Array(25).keys()],pots=[...END_POT],done=END_W.map((w,L)=>L===4||L===9?null:w);pots[4]=null;pots[9]=null;
  scene({cells:all.filter(i=>i!==24),rev:all,hands:[NEW0,NEW1],pots,done,stacks:[225,175]});
  await x.wait(800);
  ui.cells[24].classList.add('target');
  await place(x,0,1,24);
  // Line 5 and Line e complete together: each gets its ante (5 + 5), and YOU takes both pots
  hl([4]);strip(`<span class="g-line"><b>Line 5</b>Line e も同時に完成</span>`);
  await x.wait(900);
  await Promise.all([setStack(x,0,220),setStack(x,1,170),potTo(x,4,10)]);
  hl([9]);await x.wait(900);
  await Promise.all([setStack(x,0,215),setStack(x,1,165),potTo(x,9,10)]);
  // the completing player draws (YOU: Q♥, the 4th hand card), so the hand is 4 cards again at the showdowns
  await x.wait(300);await draw(x,0,K('Q♥'));await x.wait(500);
  // showdowns after both lines' betting (row first, then column)
  hl([4]);await x.wait(700);await potTo(x,4,END_POT[4],END_W[4]);
  hl([9]);await x.wait(700);await potTo(x,9,END_POT[9],END_W[9]);
  hl([]);await setStack(x,0,235);
  await x.wait(500);
  strip(`<span class="g-line"><b>BOARD 1</b>終了 · stackを持ち越し</span>`);
  await x.anim(ui.strip.firstElementChild,[{opacity:0},{opacity:1}],{duration:260});
  await x.wait(1100);
  // the next board: clear the cards and pots, deal again (the ante doubles to 10, paid per line when it completes); OPP starts this time
  await Promise.all([...ui.cells.map(c=>c.firstElementChild).filter(Boolean),...ui.hands[0].children,...ui.hands[1].children].map((el,i)=>x.anim(el,[{opacity:1,transform:'none'},{opacity:0,transform:'scale(.85)'}],{duration:380,delay:(i%10)*25,easing:'ease-in',fill:'forwards'})));
  for(let i=0;i<25;i++)setCell(i,null);
  for(let L=0;L<10;L++)setPot(L,null);
  setHand(0,[]);setHand(1,[]);
  strip(`<span class="g-line"><b>BOARD 2</b>ante 10 · 先手 OPP</span>`);
  await x.anim(ui.strip.firstElementChild,[{opacity:0},{opacity:1}],{duration:260});
  setHand(0,B2_0);setHand(1,B2_1);
  await Promise.all([...ui.hands[0].children,...ui.hands[1].children].map((el,i)=>cardIn(x,el,(i%4)*90+(i>3?40:0))));
  await x.wait(2400);
}
const B2_0=ks(['Q♠','8♥','5♣','K♦']),B2_1=ks(['3♥','9♠','J♦','6♣']);

// all-in and lost (board 2, ante 10): YOU completes Line e (the ante is posted, YOU draws Q♥ and checks), OPP puts its last 45 in and YOU
// calls; YOU wins the showdown (One Pair JJ vs One Pair 22), so OPP is out at once. Line 5 and Line a (cell a5 is still open) have no pot.
// Numbers: 235 / 165 at the start of board 2; the other lines decided so far net YOU +110 -> 345 / 55 (400 in all); ante 10 -> 335 / 45
const END2_POT=[20,140,60,60,null,null,100,20,20,null],END2_W=[1,0,0,1,null,null,0,1,0,null];
async function stepBust(x){
  const all=[...Array(25).keys()];
  scene({cells:all.filter(i=>i!==20&&i!==24),rev:all,hands:[NEW0,NEW1],pots:END2_POT,done:END2_W,stacks:[345,55]});
  await x.wait(900);
  ui.cells[24].classList.add('target');
  await place(x,0,1,24);
  hl([9]);await x.wait(600);
  await Promise.all([setStack(x,0,335),setStack(x,1,45),potTo(x,9,20)]);
  await x.wait(300);await draw(x,0,K('Q♥'));
  await x.wait(500);
  await addStrip(x,chip(0,'check'));            // YOU completed the line, so YOU acts first
  await x.wait(800);
  const BETALL='<span class="g-act"><span class="g-w1">OPP</span><span class="chip-a k-bet">BET</span><b>45</b><span class="pill allin">ALL-IN</span></span>';
  await addStrip(x,BETALL);stack(1,0);await potTo(x,9,65);
  await x.wait(900);
  // check + all-in bet + call would overflow the strip at phone width (375px): the check goes, the bet stays, the call is added
  strip(BETALL);await addStrip(x,chip(0,'call',45));stack(0,290);await potTo(x,9,110);
  await x.wait(1000);
  strip(`<span class="g-line"><b>Line e</b>showdown · YOU wins 110</span>`);
  await Promise.all([potTo(x,9,110,0),setStack(x,0,400)]);
  await x.wait(1100);
  hl([]);
  strip(`<span class="g-act"><span class="g-hn">GAME OVER</span><span class="g-w1">OPP</span><span class="g-hn">stack 0</span><span class="g-dash">·</span><span class="g-w0">YOU</span><span class="g-hn">WIN</span></span>`);
  await x.anim(ui.strip.firstElementChild,[{opacity:0},{opacity:1}],{duration:260});
  await x.wait(2600);
}

/* ---------- control ---------- */
async function go(i){
  i=Math.max(0,Math.min(STEPS.length-1,i));
  halt();cur=i;
  ui.caps.forEach((c,k)=>c.classList.toggle('on',k===i));
  ui.segs.forEach((s,k)=>{s.classList.toggle('on',k===i);s.classList.toggle('done',k<i);s.setAttribute('aria-current',k===i?'step':'false')});
  ui.prev.disabled=i===0;ui.next.disabled=i===STEPS.length-1;
  const x=ctx();
  try{
    for(let n=0;;n++){
      const run=STEPS[i].run(x);
      // each pass (and each new step) fades in from its starting position, so the loop never jumps
      ui.scene.style.opacity='';x.anim(ui.scene,[{opacity:0},{opacity:1}],{duration:n?320:220,easing:'ease-out'});
      await run;
      if(REDUCE)return;
      await x.anim(ui.scene,[{opacity:1},{opacity:0}],{duration:280,easing:'ease-in'});ui.scene.style.opacity='0';
    }
  }catch(e){if(e!==STOP)throw e}
}
function onKey(e){if(e.key==='ArrowRight')go(cur+1);else if(e.key==='ArrowLeft')go(cur-1)}

// open: start from step 1 (or the step left last time in this session); close: stop everything
function startGuide(root){
  if(!ui)build(root);
  document.addEventListener('keydown',onKey);
  go(cur);
}
function stopGuide(){halt();document.removeEventListener('keydown',onKey)}

export{startGuide,stopGuide};
