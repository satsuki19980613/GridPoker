// Grid Poker rules engine. Pure logic shared by the browser (VS CPU / UI) and the game server (VS Player).
const RANKCH='23456789TJQKA',SUITCH=['♠','♥','♦','♣'];
const rankOf=c=>(c>>2)+2,suitOf=c=>c&3;
const rankLabel=c=>{const r=RANKCH[c>>2];return r==='T'?'10':r};
const lineCells=L=>L<5?[0,1,2,3,4].map(i=>L*5+i):[0,1,2,3,4].map(i=>i*5+(L-5));
const linesOfCell=c=>[Math.floor(c/5),5+c%5];
const lineName=L=>L<5?`Line ${L+1}`:`Line ${'abcde'[L-5]}`;
const cellName=c=>'abcde'[c%5]+(Math.floor(c/5)+1);
const HAND_JA=['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];
const cardStr=c=>RANKCH[c>>2]+SUITCH[c&3];

function eval5(cs){
  const r=[rankOf(cs[0]),rankOf(cs[1]),rankOf(cs[2]),rankOf(cs[3]),rankOf(cs[4])].sort((a,b)=>b-a);
  const s0=suitOf(cs[0]);
  const flush=suitOf(cs[1])===s0&&suitOf(cs[2])===s0&&suitOf(cs[3])===s0&&suitOf(cs[4])===s0;
  const cnt=new Map();for(const x of r)cnt.set(x,(cnt.get(x)||0)+1);
  const g=[...cnt.entries()].map(([k,v])=>[v,k]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
  let sh=0;if(cnt.size===5){if(r[0]-r[4]===4)sh=r[0];else if(r[0]===14&&r[1]===5)sh=5}
  let cat,k;
  if(sh&&flush){cat=8;k=[sh]}else if(g[0][0]===4){cat=7;k=[g[0][1],g[1][1]]}
  else if(g[0][0]===3&&g[1][0]===2){cat=6;k=[g[0][1],g[1][1]]}else if(flush){cat=5;k=r}
  else if(sh){cat=4;k=[sh]}else if(g[0][0]===3){cat=3;k=g.map(x=>x[1])}
  else if(g[0][0]===2&&g[1][0]===2){cat=2;k=g.map(x=>x[1])}else if(g[0][0]===2){cat=1;k=g.map(x=>x[1])}
  else{cat=0;k=r}
  let v=cat;for(let i=0;i<5;i++)v=v*16+(k[i]||0);return v;
}
const T5=[0,0,0,0,0];
const B3=[];for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)for(let k=j+1;k<5;k++)B3.push([i,j,k]);
function bestHole(board5,hand){ // exactly 2 hole cards + exactly 3 of 5 board cards
  let best=-1,pair=null;const n=hand.length;
  for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){T5[0]=hand[a];T5[1]=hand[b];
    for(const[x,y,z]of B3){T5[2]=board5[x];T5[3]=board5[y];T5[4]=board5[z];const v=eval5(T5);if(v>best){best=v;pair=[hand[a],hand[b]]}}}
  return{v:best,pair};
}
const catOf=v=>Math.floor(v/1048576);
function handName(v){
  const c=catOf(v),k=[4,3,2,1,0].map(i=>Math.floor(v/16**i)%16),R=x=>RANKCH[x-2]||'';
  if(c===8&&k[0]===14)return'Royal Flush';
  const d=[R(k[0]),R(k[0]).repeat(2),R(k[0]).repeat(2)+R(k[1]).repeat(2),R(k[0]).repeat(3),R(k[0])+'-high',R(k[0])+'-high',R(k[0]).repeat(3)+R(k[1]).repeat(2),R(k[0]).repeat(4),R(k[0])+'-high'][c];
  return`${HAND_JA[c]} ${d}`;
}
// crypto-grade shuffle when available (server and modern browsers)
const rnd=globalThis.crypto&&globalThis.crypto.getRandomValues?()=>globalThis.crypto.getRandomValues(new Uint32Array(1))[0]/4294967296:Math.random;
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

// Fixed game settings for every game (VS CPU and VS Player; 2026-10-02 さつき): freezeout from stack 200; ante 5 on each of
// the 10 lines on the first board, doubled every board; No Limit (all-in up to what the opponent can cover; limit 'pot' =
// the former Pot Limit, kept for comparisons); NL min raise (at least the ante, or the largest raise so far on that line);
// the first player is random, then alternates every board.
const RULES=Object.freeze({stack:200,ante:5,limit:'none',minRaiseMode:'last',first:'random'});
function newGame(cfg){
  const g={cfg:Object.assign({},RULES,cfg),log:[],popups:[],ver:0,over:false,winner:null};
  g.stacks=[g.cfg.stack,g.cfg.stack];g.boardNo=0;g.boards=[];g.handGen=0;
  const first=g.cfg.first==='you'?0:g.cfg.first==='cpu'?1:(rnd()<.5?0:1);
  addLog(g,`NEW GAME · stack ${g.cfg.stack} · freezeout`,'sys');
  startBoard(g,first);
  return g;
}
// the ante of board n: the first ante doubled every board, lowered to what the short stack can post on all 10 lines
const anteFor=(g,n)=>Math.min(g.cfg.ante*2**(n-1),Math.floor(Math.min(...g.stacks)/10));
function startBoard(g,first){
  const n=g.boardNo+1,a=anteFor(g,n);
  g.boardNo=n;g.ante=a;g.minRaise=a; // ミニマムレイズ幅の下限＝その盤面のアンティ
  g.boardStart=[...g.stacks];
  g.deck=shuffle([...Array(52).keys()]);
  g.board=Array(25).fill(null);
  g.hands=[[g.deck.pop(),g.deck.pop(),g.deck.pop(),g.deck.pop()],[g.deck.pop(),g.deck.pop(),g.deck.pop(),g.deck.pop()]];
  g.contrib=Array.from({length:10},()=>[a,a]);
  g.stacks=g.stacks.map(s=>s-10*a);
  g.done=Array(10).fill(null);
  g.first=first;g.lastDraw=[null,null];g.turn=first;g.phase='place';g.queue=[];g.pendingSd=[];g.betting=null;g.lastCell=null;g.handGen++;g.lastInc=Array(10).fill(0);g.hist=Array.from({length:10},()=>[]);
  addLog(g,`BOARD ${n} · ante ${a}×10 · 先手 {${first}}`,'sys',{0:` · YOU ${g.hands[0].map(cardStr).join('')}`,1:` · YOU ${g.hands[1].map(cardStr).join('')}`});
}
// games saved before the freezeout rules (2026-10-02) continue as their board 1
function migrate(g){if(g.boardNo===undefined){g.boardNo=1;g.boards=[];g.ante=g.cfg.ante;g.minRaise=g.cfg.minRaise??g.cfg.ante;g.boardStart=[g.cfg.stack,g.cfg.stack]}return g}
// all 25 cells are filled (every line decided): stacks carry over to the next board, the ante doubles, the other player starts
function endBoard(g){
  const n=g.boardNo,net=[0,1].map(p=>g.stacks[p]-g.boardStart[p]);
  g.boards.push({n,ante:g.ante,net,stacks:[...g.stacks]});
  const next=anteFor(g,n+1);
  if(next<1)return finish(g,g.stacks[0]<g.stacks[1]?0:1,'ante');
  g.popups.push({type:'board',n,ante:g.ante,net,stacks:[...g.stacks],next:{n:n+1,ante:next,first:1-g.first}});
  addLog(g,`BOARD ${n} END · {0} ${g.stacks[0]} / {1} ${g.stacks[1]}`,'sys');
  startBoard(g,1-g.first);g.ver++;
}
function addLog(g,text,who,priv){g.log.push(priv?{text,who,priv}:{text,who})}
function drawFor(g,p){const c=g.deck.pop();g.hands[p].push(c);g.lastDraw[p]=c}
function rec(g,L,p,a,to){g.hist[L].push({p,a,to})}
function actor(g){if(g.over)return null;if(g.phase==='place')return g.turn;if(g.phase==='betting')return g.betting.toAct;return null}
const lineFull=(g,L)=>lineCells(L).every(c=>g.board[c]!==null);
const visibleTo=(g,c,p)=>{const b=g.board[c];return b&&(b.owner===p||b.rev)};

function raiseRange(g,p,L){
  const my=g.contrib[L][p],opp=g.contrib[L][1-p];
  const top=Math.max(my,opp),call=top-my,potAfter=my+opp+call;
  let maxTo=g.cfg.limit==='pot'?top+potAfter:Infinity;const cap=my+g.stacks[p];
  if(cap<=top)return null;
  const eff=opp+g.stacks[1-p]; // never more than the opponent can match
  maxTo=Math.min(maxTo,cap,eff);if(maxTo<=top)return null;
  const inc=g.cfg.minRaiseMode==='last'?Math.max(g.minRaise,g.lastInc[L]):g.minRaise;
  let minTo=top+inc;if(maxTo<minTo)minTo=maxTo;
  return[minTo,maxTo];
}
function put(g,p,L,to){const top=Math.max(g.contrib[L][0],g.contrib[L][1]);if(to-top>g.lastInc[L])g.lastInc[L]=to-top;const add=to-g.contrib[L][p];if(add<=0||add>g.stacks[p])throw new Error('bad put');g.stacks[p]-=add;g.contrib[L][p]=to}
function callLine(g,p,L){
  const o=1-p,need=g.contrib[L][o]-g.contrib[L][p],pay=Math.min(need,g.stacks[p]);
  g.stacks[p]-=pay;g.contrib[L][p]+=pay;let ref=0;
  if(g.contrib[L][p]<g.contrib[L][o]){ref=g.contrib[L][o]-g.contrib[L][p];g.stacks[o]+=ref;g.contrib[L][o]=g.contrib[L][p]}
  return{pay,ref};
}
function doPlace(g,p,card,cell){
  if(g.phase!=='place'||g.turn!==p)throw new Error('not place');
  const i=g.hands[p].indexOf(card);if(i<0||g.board[cell]!==null)throw new Error('illegal place');
  g.hands[p].splice(i,1);g.board[cell]={card,owner:p,rev:false};g.lastCell=cell;
  drawFor(g,p);
  addLog(g,`{${p}} 配置 ${cellName(cell)}`,p,{[p]:` ${cardStr(card)} · draw ${cardStr(g.lastDraw[p])}`});
  const comp=linesOfCell(cell).filter(L=>!g.done[L]&&lineFull(g,L));
  g.ver++;
  if(comp.length){g.queue=comp;g.pendingSd=[];startCompletion(g)}
  else endTurn(g);
}
function startCompletion(g){
  if(!g.queue.length)return afterCompletions(g);
  const L=g.queue[0],c=g.contrib[L],p=g.turn,o=1-p;
  if(c[p]<c[o])g.betting={line:L,toAct:p,mode:'facing',checks:0,raises:0};
  else if(c[p]===c[o])g.betting={line:L,toAct:p,mode:'open',checks:0,raises:0};
  else g.betting={line:L,toAct:o,mode:'facing',checks:0,raises:0};
  revealLine(g,L);g.phase='betting';addLog(g,`${lineName(L)} 完成 · ${lineCells(L).map(x=>cardStr(g.board[x].card)).join(' ')} · pot ${c[0]+c[1]}`,'sys');g.ver++;autoBet(g);
}
function autoBet(g){
  while(g.phase==='betting'){
    const b=g.betting,p=b.toAct,lg=bettingLegal(g);
    if(lg.mode==='facing'&&g.stacks[p]===0){doBetRaw(g,p,'call');continue}
    if(lg.mode==='open'&&!lg.raise&&!raiseRange(g,1-p,b.line)){doBetRaw(g,p,'check');continue}
    break;
  }
}
function bettingLegal(g){
  const b=g.betting,p=b.toAct,L=b.line,my=g.contrib[L][p],opp=g.contrib[L][1-p];
  if(b.mode==='facing')return{mode:'facing',toCall:Math.min(opp-my,g.stacks[p]),allin:g.stacks[p]<=opp-my,raise:raiseRange(g,p,L)};
  return{mode:'open',raise:raiseRange(g,p,L)};
}
function doBet(g,p,act,to){doBetRaw(g,p,act,to);autoBet(g)}
function doBetRaw(g,p,act,to){
  const b=g.betting;if(!b||b.toAct!==p)throw new Error('not your bet');
  const L=b.line,o=1-p,lg=bettingLegal(g);
  if(act==='fold'&&lg.mode==='facing'){
    // the uncalled part of the last bet goes back first; the winner takes the matched pot
    const c=g.contrib[L],ret=c[o]-c[p];if(ret>0){g.stacks[o]+=ret;c[o]-=ret}
    const pot=c[0]+c[1];g.stacks[o]+=pot;
    rec(g,L,p,'フォールド',c[p]);
    g.done[L]={L,winner:o,pot,ret,folded:true,folder:p,contrib:[...c]};revealLine(g,L);
    addLog(g,`{${p}} fold · {${o}} wins ${pot} (no show${ret>0?` · uncalled ${ret} returned`:''})`,p);
    g.popups.push({type:'fold',L,winner:o,pot,ret,folder:p});return nextCompletion(g);
  }
  if(act==='call'&&lg.mode==='facing'){const r=callLine(g,p,L);rec(g,L,p,'コール',g.contrib[L][p]);addLog(g,`{${p}} call ${r.pay}${r.ref?` · all-in (uncalled ${r.ref} returned)`:g.stacks[p]===0?' · all-in':''}`,p);return pendSd(g,L)}
  if(act==='check'&&lg.mode==='open'){
    b.checks++;rec(g,L,p,'チェック',g.contrib[L][p]);addLog(g,`{${p}} check`,p);
    if(b.checks>=2)return pendSd(g,L);
    b.toAct=o;g.ver++;return;
  }
  if(act==='raise'){
    const r=lg.raise;if(!r||to<r[0]||to>r[1])throw new Error('illegal raise');
    const verb=lg.mode==='open'?'ベット':'レイズ';put(g,p,L,to);b.mode='facing';b.toAct=o;b.raises++;
    rec(g,L,p,verb,to);addLog(g,`{${p}} ${verb==='ベット'?'bet':'raise to'} ${to}${g.stacks[p]===0?' · all-in':''} · pot ${g.contrib[L][0]+g.contrib[L][1]}`,p);g.ver++;return;
  }
  throw new Error('illegal bet '+act);
}
// コール／両者チェックで終わったラインはここで保留。ハンドは全ラインのベッティング終了後（afterCompletions）に公開する
function pendSd(g,L){g.pendingSd.push(L);if(g.queue.length>1)addLog(g,`${lineName(L)} action closed · SD pending`,'sys');nextCompletion(g)}
function revealLine(g,L){for(const c of lineCells(L))g.board[c].rev=true}
function showdownLine(g,L){
  const bc=lineCells(L).map(c=>g.board[c].card);
  const r=[0,1].map(p=>bestHole(bc,g.hands[p]));
  const pot=g.contrib[L][0]+g.contrib[L][1];let w=null;
  if(r[0].v===r[1].v){g.stacks[0]+=Math.floor(pot/2);g.stacks[1]+=pot-Math.floor(pot/2)}
  else{w=r[0].v>r[1].v?0:1;g.stacks[w]+=pot}
  const rec0={L,winner:w,pot,names:[handName(r[0].v),handName(r[1].v)],hands:[[...g.hands[0]],[...g.hands[1]]],pairs:[r[0].pair,r[1].pair],board:bc,contrib:[...g.contrib[L]]};
  g.done[L]=rec0;const rec=rec0;revealLine(g,L);
  addLog(g,`${lineName(L)} SD · {0} ${rec.hands[0].map(cardStr).join('')} ${rec.names[0]} / {1} ${rec.hands[1].map(cardStr).join('')} ${rec.names[1]} · ${w===null?`split ${pot}`:`{${w}} wins ${pot}`}`,'sys');
  g.popups.push({type:'showdown',...rec0});
}
function nextCompletion(g){g.queue.shift();g.betting=null;g.ver++;startCompletion(g)}
function afterCompletions(g){
  const pl=g.pendingSd;g.pendingSd=[];
  for(const L of pl)showdownLine(g,L); // 横→縦の順（完成順）
  // stack 0 after the lines are decided: the game ends here and that player loses (2026-10-02 さつき)
  const bust=[0,1].filter(p=>g.stacks[p]===0);
  if(bust.length)return finish(g,bust.length===1?bust[0]:null,'stack');
  if(g.board.every(x=>x!==null))return endBoard(g); // the next board deals new hands
  // 完成した全ラインはフォールドかショーダウンで決着済み。決着したら必ず配り直す
  g.deck.push(...g.hands[0],...g.hands[1]);shuffle(g.deck);
  g.hands=[[g.deck.pop(),g.deck.pop(),g.deck.pop(),g.deck.pop()],[g.deck.pop(),g.deck.pop(),g.deck.pop(),g.deck.pop()]];
  g.handGen++;addLog(g,'Redeal','sys',{0:` · YOU ${g.hands[0].map(cardStr).join('')}`,1:` · YOU ${g.hands[1].map(cardStr).join('')}`});
  g.ver++;endTurn(g);
}
function endTurn(g){
  if(g.board.every(x=>x!==null))return endBoard(g);
  g.turn=1-g.turn;g.phase='place';g.ver++;
}
// bust: the seat that lost (null: both at 0 at once, a draw). reason 'stack' (stack 0 after the lines were decided;
// undecided lines keep their antes) or 'ante' (cannot post an ante of 1 on every line for the next board)
function finish(g,bust,reason){
  g.over=true;g.phase='over';g.betting=null;const s=g.stacks;
  g.bust=bust;g.bustReason=reason;g.winner=bust===null?null:1-bust;
  addLog(g,`GAME OVER${bust!=null?` · {${bust}} ${reason==='ante'?'cannot post the ante':'stack 0'}`:''} · {0} ${s[0]} / {1} ${s[1]} · ${g.winner===null?'DRAW':`{${g.winner}} WIN`}`,'sys');g.ver++;
}


/* ---------- online play: time-outs and resignation ---------- */
// a player who runs out of time: placement goes to a random empty cell, betting checks or folds
function autoMove(g,p){
  if(actor(g)!==p)throw new Error('not your turn');
  if(g.phase==='place'){
    const empty=[];for(let c=0;c<25;c++)if(g.board[c]===null)empty.push(c);
    return doPlace(g,p,g.hands[p][Math.floor(rnd()*g.hands[p].length)],empty[Math.floor(rnd()*empty.length)]);
  }
  return doBet(g,p,bettingLegal(g).mode==='open'?'check':'fold');
}
// p loses the game regardless of stacks (resign or repeated time-outs)
function forfeit(g,p,reason){
  if(g.over)throw new Error('game over');
  g.over=true;g.phase='over';g.betting=null;g.queue=[];g.winner=1-p;g.forfeit={p,reason};
  addLog(g,`{${p}} ${reason==='resign'?'resign':'time-out'} · {${1-p}} WIN`,'sys');g.ver++;
}

export{RULES,RANKCH,SUITCH,rankOf,suitOf,rankLabel,lineCells,linesOfCell,lineName,cellName,HAND_JA,cardStr,eval5,T5,B3,bestHole,catOf,handName,rnd,shuffle,newGame,startBoard,endBoard,anteFor,migrate,addLog,drawFor,rec,actor,lineFull,visibleTo,raiseRange,put,callLine,doPlace,startCompletion,autoBet,bettingLegal,doBet,doBetRaw,pendSd,revealLine,showdownLine,nextCompletion,afterCompletions,endTurn,finish,autoMove,forfeit};
