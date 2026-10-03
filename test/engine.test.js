// Rules engine: whole games with the CPU and with random legal actions keep every invariant.
import{test}from'node:test';
import assert from'node:assert/strict';
import{newGame,actor,doBet,bettingLegal,raiseRange,eval5,bestHole,autoMove,forfeit,endBoard,migrate,doPlace}from'../src/engine.js';
import{cpuMove}from'../src/cpu.js';

// late antes (the rule) and fill (the earlier comparison mode, also what games saved before 2026-10-03 use) both run through every loop
const BASE=[{stack:200,ante:5,minRaiseMode:'fixed'},{stack:200,ante:5,minRaiseMode:'last'},{stack:100,ante:5,minRaiseMode:'fixed'},{stack:100,ante:1,minRaiseMode:'last'},{stack:300,ante:10,minRaiseMode:'fixed'}];
const CFGS=[...BASE.map(x=>({...x,anteMode:'late'})),...BASE.map(x=>({...x,anteMode:'fill'}))];
const FILL={first:'you',anteMode:'fill'};
const c=s=>{const r='23456789TJQKA'.indexOf(s[0]),u='shdc'.indexOf(s[1]);return r*4+u};

function play(fuzz,i){
  const cfg={...CFGS[i%CFGS.length],first:'random'},g=newGame(cfg),total=2*cfg.stack,late=cfg.anteMode==='late';let steps=0;
  while(!g.over&&steps++<5000){
    const p=actor(g),b0=g.boardNo,d0=g.done.filter(Boolean).length;
    if(fuzz&&g.phase==='betting'&&Math.random()<.7){
      const lg=bettingLegal(g),r=Math.random(),amt=()=>lg.raise[0]+Math.floor(Math.random()*(lg.raise[1]-lg.raise[0]+1));
      if(lg.mode==='facing'){if(r<.3)doBet(g,p,'fold');else if(r<.6||!lg.raise)doBet(g,p,'call');else doBet(g,p,'raise',amt())}
      else{if(r<.5||!lg.raise)doBet(g,p,'check');else doBet(g,p,'raise',amt())}
    }else if(fuzz&&Math.random()<.2)autoMove(g,p);
    else cpuMove(g,p);
    let t=g.stacks[0]+g.stacks[1];for(let L=0;L<10;L++)if(!g.done[L])t+=g.contrib[L][0]+g.contrib[L][1];
    assert.equal(t,total,'chips are conserved');
    assert.ok(g.stacks[0]>=0&&g.stacks[1]>=0,'no negative stack');
    if(!g.over)assert.deepEqual(g.hands.map(h=>h.length),[4,4],'hands stay at 4 cards');
    if(g.phase==='place')assert.equal(g.pendingSd.length,0);
    if(late){ // late antes: while placing, both have chips and no chips wait in an undecided line; nothing is ever swept
      assert.equal(g.left,undefined,'no undecided pots are swept');
      if(g.phase==='place'&&!g.over){
        assert.ok(g.stacks[0]>0&&g.stacks[1]>0,'both have chips while placing');
        for(let L=0;L<10;L++)if(!g.done[L])assert.deepEqual(g.contrib[L],[0,0],'undecided lines hold no chips');
      }
    }
    // stack 0 is out whenever lines are decided: a game that goes on after a decision has chips in both hands
    if(!g.over&&(g.boardNo!==b0||g.done.filter(Boolean).length>d0)){
      const s=g.boardNo!==b0?g.boards.at(-1).stacks:g.stacks;assert.ok(s[0]>0&&s[1]>0,'stack 0 after a decision is out');
    }
  }
  assert.ok(g.over,'game finishes');
  // freezeout: a game only ends when a player is out
  assert.ok(g.bust===0||g.bust===1||g.bust===null,'someone is out');
  if(late){assert.ok(g.bust===0||g.bust===1,'no draw with late antes');assert.equal(g.bustReason,'chips');assert.equal(g.left,undefined)}
  if(g.bust!==null)assert.equal(g.winner,1-g.bust);
  // the loser has no chips anywhere (stack and undecided lines); every chip is accounted for
  let left=g.stacks[0]+g.stacks[1];for(let L=0;L<10;L++)if(!g.done[L])left+=g.contrib[L][0]+g.contrib[L][1];
  assert.equal(left,total);
  if(g.bustReason==='chips'){
    if(g.bust!==null)assert.equal(g.stacks[g.bust],0);
    for(let L=0;L<10;L++)if(!g.done[L])assert.deepEqual(g.contrib[L],[0,0],'undecided pots are settled at the end');
  }else{
    assert.equal(g.bustReason,'ante');assert.ok(g.stacks[g.bust]<10,'cannot post 1 on every line');
    assert.equal(g.stacks[0]+g.stacks[1],total);
  }
  // boards: the ante doubles every board (a short stack goes all-in line by line instead of lowering it)
  g.boards.forEach((b,i)=>{assert.equal(b.n,i+1);assert.equal(b.ante,cfg.ante*2**i)});
  assert.ok(g.log.every(e=>!/\b(YOU|CPU)\b/.test(e.text)),'shared log text names seats only as {0}/{1}');
  return g;
}

test('200 games CPU vs CPU (late and fill antes)',()=>{for(let i=0;i<200;i++)play(false,i)});
test('200 games with random legal actions and time-outs (late and fill antes)',()=>{
  let busts=0;for(let i=0;i<200;i++)if(play(true,i).board.some(x=>x===null))busts++;
  assert.ok(busts>0,'some games end mid-board with a stack of 0');
});

test('showdown uses exactly 2 hole cards and 3 board cards',()=>{
  const board=['As','Ks','Qs','Js','Ts'].map(c);
  assert.equal(Math.floor(bestHole(board,['2h','3d','4c','7h'].map(c)).v/1048576),0,'royal on board + junk hand = high card');
  assert.notEqual(Math.floor(bestHole(['As','Ks','Qs','2d','3h'].map(c),['9s','4h','5d','6c'].map(c)).v/1048576),5,'one suited hole card is not a flush');
  assert.equal(Math.floor(eval5(['As','Ks','Qs','Js','Ts'].map(c))/1048576),8);
});

test('forfeit ends the game for the other seat',()=>{
  const g=newGame({first:'you'});forfeit(g,0,'resign');
  assert.equal(g.over,true);assert.equal(g.winner,1);assert.deepEqual(g.forfeit,{p:0,reason:'resign'});
  assert.throws(()=>forfeit(g,1,'resign'));
});

// after a forfeit nothing waits in an undecided line: every player has its own chips back and the stacks add up to the total
const settled=g=>g.contrib.every((x,L)=>g.done[L]||(x[0]===0&&x[1]===0));
test('forfeit during betting (late antes): chips in the line being bet, the queued line and the line waiting for showdown go back to their owners',()=>{
  // one line: seat 0 bets, seat 1 resigns
  let g=newGame({first:'you'});g.stacks=[200,100];lateTwoLines(g);doPlace(g,0,c('Ah'),0);
  doBet(g,0,'raise',45);assert.deepEqual(g.stacks,[155,95]);assert.deepEqual(g.contrib[0],[45,5]);
  forfeit(g,1,'resign');
  assert.equal(g.over,true);assert.equal(g.winner,0);assert.deepEqual(g.stacks,[200,100],'each gets its own chips back');
  assert.ok(settled(g));assert.deepEqual(g.contrib[0],[0,0]);assert.deepEqual(g.pendingSd,[]);assert.deepEqual(g.queue,[]);assert.equal(g.betting,null);assert.equal(total(g),300);
  // two lines: Line 1 called (waiting for showdown), Line a bet, seat 0 times out three times
  g=newGame({first:'you'});g.stacks=[200,100];lateTwoLines(g);doPlace(g,0,c('Ah'),0);
  doBet(g,0,'raise',45);doBet(g,1,'call');doBet(g,0,'raise',25);
  assert.deepEqual(g.pendingSd,[0]);assert.deepEqual(g.contrib[0],[45,45]);assert.deepEqual(g.contrib[5],[25,5]);assert.deepEqual(g.stacks,[130,50]);
  forfeit(g,0,'timeout');
  assert.equal(g.winner,1);assert.deepEqual(g.forfeit,{p:0,reason:'timeout'});assert.deepEqual(g.stacks,[200,100]);
  assert.ok(settled(g));assert.deepEqual(g.contrib[0],[0,0]);assert.deepEqual(g.contrib[5],[0,0]);assert.deepEqual(g.pendingSd,[]);assert.equal(g.done[0],null);assert.equal(total(g),300);
  assert.ok(g.log.every(e=>!/\b(YOU|CPU)\b/.test(e.text)),'log text stays seat-neutral');
});
test('forfeit during betting (fill antes): the antes posted on every line go back to their owners',()=>{
  const g=newGame(FILL);lateLine1(g,'win0');g.stacks=[150,150];doPlace(g,0,c('3d'),4);
  doBet(g,0,'raise',55);assert.deepEqual(g.stacks,[100,150]);assert.deepEqual(g.contrib[0],[55,5]);
  forfeit(g,1,'resign');
  assert.equal(g.winner,0);assert.deepEqual(g.stacks,[200,200],'seat 0: 100 + 55 + 9 antes of 5; seat 1: 150 + 5 + 9 antes of 5');
  assert.ok(g.contrib.every(x=>x[0]===0&&x[1]===0));assert.equal(g.stacks[0]+g.stacks[1],400);
});

test('time-out move: random placement, or check / fold',()=>{
  const g=newGame({first:'you'});autoMove(g,0);
  assert.equal(g.board.filter(Boolean).length,1);assert.equal(g.hands[0].length,4);
  assert.throws(()=>autoMove(g,0),/not your turn/);
});

test('(fill) No Limit: bet up to all-in, capped at what the opponent can cover; limit pot keeps the old cap',()=>{
  const g=newGame(FILL);
  // complete Line 1 by hand: both seats' antes are in, stacks 150 / 150
  g.stacks=[150,90];g.board=g.board.map((x,i)=>i<5?{card:i,owner:0,rev:true}:null);g.phase='betting';g.betting={line:0,toAct:0,mode:'open',checks:0,raises:0};
  assert.deepEqual(raiseRange(g,0,0),[10,95],'open: min ante, max = the opponent stack (90) + 5 already in');
  assert.deepEqual(raiseRange(g,1,0),[10,95],'the short stack can shove all of it');
  g.cfg.limit='pot';assert.deepEqual(raiseRange(g,0,0),[10,15],'Pot Limit: max = pot (10) on top of 5');
  g.cfg.limit='none';doBet(g,0,'raise',95);
  assert.equal(g.stacks[0],60);assert.deepEqual(bettingLegal(g).raise,null,'the opponent cannot re-raise: all-in to call');
  assert.equal(bettingLegal(g).allin,true);
  doBet(g,1,'fold');
  assert.equal(g.stacks[0],160,'uncalled 90 back + the matched pot 10');
  assert.equal(g.done[0].pot,10);assert.equal(g.done[0].ret,90);assert.deepEqual(g.done[0].contrib,[5,5]);
});

test('(fill) freezeout: a full board carries the stacks over, doubles the ante and swaps the first player',()=>{
  const g=newGame(FILL);assert.equal(g.boardNo,1);assert.equal(g.ante,5);assert.deepEqual(g.stacks,[150,150]);
  g.stacks=[230,120];endBoard(g); // as if board 1 ended 280 / 120 (antes 50 each already posted on board 1)
  assert.equal(g.boardNo,2);assert.equal(g.ante,10);assert.equal(g.first,1);assert.equal(g.turn,1);
  assert.deepEqual(g.stacks,[130,20]);assert.ok(g.contrib.every(c=>c[0]===10&&c[1]===10));
  assert.equal(g.popups.at(-1).type,'board');assert.deepEqual(g.popups.at(-1).next,{n:2,ante:10,first:1});
  assert.ok(g.board.every(x=>x===null));assert.deepEqual(g.hands.map(h=>h.length),[4,4]);assert.equal(g.minRaise,10);
  // board 3, ante 20: the short stack (115) posts 20 on Line 1–5 and its last 15 on Line 6; Line 7–10 carry no pot
  g.stacks=[275,115];endBoard(g);assert.equal(g.ante,20);assert.deepEqual(g.stacks,[160,0]);
  assert.deepEqual(g.contrib.map(c=>c[0]),[20,20,20,20,20,15,0,0,0,0]);assert.ok(g.contrib.every(c=>c[0]===c[1]));
  // out of chips when a board ends: that player loses
  g.stacks=[400,0];endBoard(g);assert.equal(g.over,true);assert.equal(g.winner,0);assert.equal(g.bust,1);assert.equal(g.bustReason,'chips');
});

test('(even) anteMode even (comparison): the ante drops to the short stack ÷ 10; under 10 chips loses',()=>{
  const g=newGame({first:'you',anteMode:'even'});
  g.stacks=[230,120];endBoard(g);g.stacks=[275,115];endBoard(g);assert.equal(g.ante,11);assert.deepEqual(g.stacks,[165,5]);
  g.stacks=[391,9];endBoard(g);assert.equal(g.over,true);assert.equal(g.bust,1);assert.equal(g.bustReason,'ante');
});

// Line 1 complete with fixed cards: seat 0 holds the nuts, seat 1 junk (swap=true swaps the hands; 'split': the same straight)
function line1(g,swap){
  const k=c=>'23456789TJQKA'.indexOf(c[0])*4+'shdc'.indexOf(c[1]);
  for(let i=0;i<5;i++)g.board[i]={card:k(['Ah','Kh','Qh','2c','3d'][i]),owner:i%2,rev:true};
  const h=swap==='split'?[['Jc','Tc','4s','5s'].map(k),['Jd','Td','4c','5c'].map(k)]:[['Jh','Th','4s','5s'].map(k),['7c','8d','9s','6c'].map(k)];
  g.hands=swap===true?[h[1],h[0]]:h;
  g.phase='betting';g.queue=[0];g.pendingSd=[];g.betting={line:0,toAct:0,mode:'open',checks:0,raises:0};
}
test('(fill) stack 0 is all-in, not out: no betting on the line, and winning it plays on',()=>{
  const g=newGame(FILL);g.stacks=[290,0];line1(g,true);
  assert.equal(bettingLegal(g).raise,null,'nothing to bet against an all-in player');
  doBet(g,0,'check'); // the all-in player checks automatically; showdown
  assert.ok(g.done[0],'line decided');assert.equal(g.over,false);assert.equal(g.stacks[1],10);assert.equal(g.phase,'place');
});

test('(fill) all-in and lost: out at once even with antes left in other lines; those pots go to the winner',()=>{
  const g=newGame(FILL);g.stacks=[290,0];line1(g,false);
  doBet(g,0,'check');
  assert.equal(g.over,true);assert.equal(g.winner,0);assert.equal(g.bust,1);assert.equal(g.bustReason,'chips');
  assert.deepEqual(g.stacks,[390,0]); // 290 + every pot (5+5 on 10 lines)
  assert.ok(g.contrib.every((c,L)=>g.done[L]||c[0]+c[1]===0),'undecided pots swept to the winner');
  assert.deepEqual(g.left,{to:0,contrib:[45,45]},'the undecided pots are recorded for the results list');
  assert.ok(g.board.some(x=>x===null),'ended mid-board');
});

test('(fill) stack 0 when a line without its chips is decided: out at once (antes are entry fees, not its chips)',()=>{
  const g=newGame(FILL);g.stacks=[290,0];g.contrib[0]=[0,0];g.stacks[0]+=5;g.stacks[1]+=0; // Line 1 has no pot
  const before=g.stacks[0]+g.contrib.reduce((t,c)=>t+c[0]+c[1],0);
  line1(g,true); // seat 1 even holds the nuts on Line 1, but there is nothing to win there
  doBet(g,0,'check');
  assert.equal(g.over,true);assert.equal(g.winner,0);assert.equal(g.bust,1);assert.equal(g.bustReason,'chips');
  assert.deepEqual(g.stacks,[before,0]);
});

test('(fill) a split gives the all-in player half the pot back: plays on',()=>{
  const g=newGame(FILL);g.stacks=[290,0];line1(g,'split');
  doBet(g,0,'check');
  assert.equal(g.done[0].winner,null);assert.equal(g.over,false);assert.deepEqual(g.stacks,[295,5]);assert.equal(g.phase,'place');
});

test('(fill) both stacks 0 when a line is decided: a draw, each takes back its own antes',()=>{
  const g=newGame(FILL);g.stacks=[0,0];g.contrib[0]=[0,0]; // both all-in by the ante; Line 1 has no pot
  line1(g,false);doBet(g,0,'check');
  assert.equal(g.over,true);assert.equal(g.winner,null);assert.equal(g.bust,null);assert.deepEqual(g.stacks,[45,45]);
  assert.deepEqual(g.left,{to:null,contrib:[45,45]});
});

test('(fill) calling all-in on one of two lines completed together, then losing it: out after both lines are decided',()=>{
  const g=newGame(FILL);const k=c=>'23456789TJQKA'.indexOf(c[0])*4+'shdc'.indexOf(c[1]);
  // Line 1 (a1–e1) and Line a (a1–a5) complete together with a1; seat 0 holds the nuts on both
  const cards={0:'Ah',1:'Kh',2:'Qh',3:'2c',4:'3d',5:'Ac',10:'Kc',15:'Qc',20:'2d'};
  for(const[i,cc]of Object.entries(cards))g.board[+i]={card:k(cc),owner:+i%2,rev:true};
  g.hands=[['Jh','Th','Jc','Tc'].map(k),['7s','8d','9s','6d'].map(k)];g.stacks=[245,45];g.turn=0;
  g.phase='betting';g.queue=[0,5];g.pendingSd=[];g.betting={line:0,toAct:0,mode:'open',checks:0,raises:0};
  doBet(g,0,'raise',50); // seat 0 bets 45 over the ante: puts seat 1 all-in
  doBet(g,1,'call'); // Line a: nobody can bet against the all-in player, so it checks through; then both showdowns
  assert.ok(g.done[0]&&g.done[5],'both lines decided');assert.equal(g.done[0].winner,0);assert.equal(g.done[5].winner,0);
  assert.equal(g.over,true);assert.equal(g.winner,0);assert.deepEqual(g.stacks,[390,0]);
});

test('(fill) all-in lost on one of two lines completed together, but the other line won: plays on (stack after both)',()=>{
  const g=newGame(FILL);const k=c=>'23456789TJQKA'.indexOf(c[0])*4+'shdc'.indexOf(c[1]);
  const cards={0:'Ah',1:'Kh',2:'Qh',3:'2c',4:'3d',5:'Ac',10:'Kc',15:'Qc',20:'2d'};
  for(const[i,cc]of Object.entries(cards))g.board[+i]={card:k(cc),owner:+i%2,rev:true};
  // Line 1: seat 0 royal flush; Line a: seat 1 full house (A A A K K) beats seat 0's straight
  g.hands=[['Jh','Th','4s','5s'].map(k),['Ad','Ks','9s','6d'].map(k)];g.stacks=[245,45];g.turn=0;
  g.phase='betting';g.queue=[0,5];g.pendingSd=[];g.betting={line:0,toAct:0,mode:'open',checks:0,raises:0};
  doBet(g,0,'raise',50);doBet(g,1,'call');
  assert.equal(g.done[0].winner,0);assert.equal(g.done[5].winner,1);
  assert.equal(g.over,false);assert.deepEqual(g.stacks,[300,10]);assert.equal(g.phase,'place');
});

test('(fill) no chips anywhere ends the game at once, even mid-board',()=>{
  const g=newGame(FILL);g.stacks=[390,0];g.contrib=g.contrib.map((c,L)=>L===0?[5,5]:[0,0]); // all-in on Line 1 only
  for(let i=0;i<5;i++)g.board[i]={card:g.deck.pop(),owner:i%2,rev:true};
  g.hands[0]=[];g.hands[1]=[]; // fix the showdown: seat 0 holds the nuts against seat 1's junk
  const k=c=>'23456789TJQKA'.indexOf(c[0])*4+'shdc'.indexOf(c[1]);
  g.board.slice(0,5).forEach((b,i)=>{b.card=k(['Ah','Kh','Qh','2c','3d'][i])});g.hands=[['Jh','Th','4s','5s'].map(k),['7c','8d','9s','6c'].map(k)];
  g.phase='betting';g.queue=[0];g.pendingSd=[];g.betting={line:0,toAct:0,mode:'open',checks:0,raises:0};
  doBet(g,0,'check');
  assert.equal(g.over,true);assert.equal(g.winner,0);assert.equal(g.bustReason,'chips');assert.ok(g.board.some(x=>x===null),'ended mid-board');
});

/* ---------- late antes (the rule, 2026-10-03): a line's ante is posted when the line is completed ---------- */
const total=g=>g.stacks[0]+g.stacks[1]+g.contrib.reduce((t,x,L)=>t+(g.done[L]?0:x[0]+x[1]),0);
// Line 1 about to be completed by seat 0 placing 3d on e1 (turn 0). 'win0': seat 0 holds the royal flush, seat 1 junk; 'win1': swapped;
// 'split': both the same straight. Seat 0's hand after the draw is hands[0]; the deck top is exactly that draw.
function lateLine1(g,mode){
  const B=['Ah','Kh','Qh','2c'].map(c);B.forEach((cd,i)=>{g.board[i]={card:cd,owner:i%2,rev:false}});
  const H={win0:[['Jh','Th','4s','5s'],['7c','8d','9s','6c']],win1:[['7c','8d','9s','6c'],['Jh','Th','4s','5s']],split:[['Jc','Tc','4s','5s'],['Jd','Td','4c','5c']]}[mode].map(h=>h.map(c));
  g.hands=[[c('3d'),...H[0].slice(0,3)],H[1]];g.deck=[H[0][3]];g.turn=0;g.phase='place';
  const bc=[...B,c('3d')],v=H.map(h=>bestHole(bc,h).v);
  if(mode==='win0')assert.ok(v[0]>v[1]);else if(mode==='win1')assert.ok(v[0]<v[1]);else assert.equal(v[0],v[1]);
}
// Line 1 (a1–e1) and Line a (a1–a5) completed together by seat 0 placing Ah on a1; seat 0 holds the straight/royal on both
function lateTwoLines(g){
  const cards={1:'Kh',2:'Qh',3:'2c',4:'3d',5:'Ac',10:'Kc',15:'Qc',20:'2d'};
  for(const[i,cc]of Object.entries(cards))g.board[+i]={card:c(cc),owner:+i%2,rev:false};
  g.hands=[['Ah','Jh','Th','4s'].map(c),['7s','8d','9s','6d'].map(c)];g.deck=[c('5s')];g.turn=0;g.phase='place';
  const l1=[0,1,2,3,4].map(i=>i?g.board[i].card:c('Ah')),la=[0,5,10,15,20].map(i=>i?g.board[i].card:c('Ah')),h0=['Jh','Th','4s','5s'].map(c);
  assert.ok(bestHole(l1,h0).v>bestHole(l1,g.hands[1]).v&&bestHole(la,h0).v>bestHole(la,g.hands[1]).v);
}

test('late antes (default): nothing is posted when a board starts',()=>{
  const g=newGame({first:'you'});
  assert.equal(g.cfg.anteMode,'late');assert.equal(g.ante,5);assert.deepEqual(g.stacks,[200,200]);
  assert.ok(g.contrib.length===10&&g.contrib.every(x=>x[0]===0&&x[1]===0));
  assert.ok(g.log.some(e=>e.text==='BOARD 1 · ante 5 · 先手 {0}'));
});

test('late antes: completing a line posts min(ante, stacks) on that line only, before its betting',()=>{
  const g=newGame({first:'you'});lateLine1(g,'win0');
  doPlace(g,0,c('3d'),4);
  assert.equal(g.phase,'betting');assert.equal(g.betting.line,0);assert.equal(g.betting.mode,'open');
  assert.deepEqual(g.contrib[0],[5,5]);assert.deepEqual(g.stacks,[195,195]);
  assert.ok(g.contrib.every((x,L)=>L===0||(x[0]===0&&x[1]===0)),'other lines stay empty');
  assert.ok(g.log.some(e=>e.text==='Line 1 完成 · A♥ K♥ Q♥ 2♣ 3♦ · ante 5 · pot 10'),g.log.map(e=>e.text).join('\n'));
  assert.equal(total(g),400);
  doBet(g,0,'check');doBet(g,1,'check'); // seat 0 wins the 10 pot (royal flush)
  assert.equal(g.done[0].winner,0);assert.equal(g.done[0].pot,10);assert.deepEqual(g.stacks,[205,195]);
  assert.equal(g.over,false);assert.equal(g.phase,'place');assert.equal(g.turn,1);assert.equal(total(g),400);
});

test('late antes: bet limits count the stacks left after the ante',()=>{
  const g=newGame({first:'you'});g.stacks=[200,100];lateLine1(g,'win0');doPlace(g,0,c('3d'),4);
  assert.deepEqual(g.stacks,[195,95]);
  assert.deepEqual(raiseRange(g,0,0),[10,100],'max = the opponent stack (95) + the 5 ante in');
  assert.deepEqual(raiseRange(g,1,0),[10,100]);
});

test('late antes: a short stack posts all it has and is all-in; there is nothing to bet and the line goes to showdown',()=>{
  // seat 1 has 3: it posts 3, seat 0 matches 3; seat 0 holds the nuts and the game ends at once (seat 1 out)
  let g=newGame({first:'you'});g.stacks=[200,3];lateLine1(g,'win0');doPlace(g,0,c('3d'),4);
  assert.ok(g.log.some(e=>e.text==='Line 1 完成 · A♥ K♥ Q♥ 2♣ 3♦ · ante 3 · all-in · pot 6'),g.log.map(e=>e.text).join('\n'));
  assert.deepEqual(g.done[0].contrib,[3,3]);assert.equal(g.done[0].pot,6);assert.equal(g.done[0].winner,0);
  assert.deepEqual(g.stacks,[203,0]);assert.equal(g.over,true);assert.equal(g.bust,1);assert.equal(g.bustReason,'chips');assert.equal(g.winner,0);
  assert.equal(g.left,undefined);assert.ok(g.board.some(x=>x===null),'ended mid-board');
  // the all-in player wins: plays on with the pot
  g=newGame({first:'you'});g.stacks=[200,3];lateLine1(g,'win1');doPlace(g,0,c('3d'),4);
  assert.deepEqual(g.stacks,[197,6]);assert.equal(g.over,false);assert.equal(g.phase,'place');assert.equal(g.pendingSd.length,0);
  assert.deepEqual(g.contrib.map(x=>[...x]),g.contrib.map((x,L)=>L===0?[3,3]:[0,0]),'only Line 1 holds its ante');assert.deepEqual(g.done[0].contrib,[3,3]);assert.equal(total(g),203);
  // the other seat short: same, with the short stack acting first
  g=newGame({first:'you'});g.stacks=[2,200];lateLine1(g,'win1');doPlace(g,0,c('3d'),4);
  assert.deepEqual(g.stacks,[0,202]);assert.equal(g.over,true);assert.equal(g.bust,0);assert.equal(g.winner,1);
});

test('late antes: a chop gives half back, so a short stack keeps playing',()=>{
  let g=newGame({first:'you'});g.stacks=[200,3];lateLine1(g,'split');doPlace(g,0,c('3d'),4);
  assert.equal(g.done[0].winner,null);assert.equal(g.over,false);assert.deepEqual(g.stacks,[200,3]);assert.equal(g.phase,'place');
  g=newGame({first:'you'});lateLine1(g,'split');doPlace(g,0,c('3d'),4);doBet(g,0,'check');doBet(g,1,'check');
  assert.equal(g.done[0].winner,null);assert.deepEqual(g.stacks,[200,200]);assert.equal(g.over,false);
});

test('late antes: one card completing two lines posts each ante when its own betting starts',()=>{
  const g=newGame({first:'you'});lateTwoLines(g);
  doPlace(g,0,c('Ah'),0);
  assert.deepEqual(g.queue,[0,5]);assert.equal(g.betting.line,0);
  assert.deepEqual(g.contrib[0],[5,5]);assert.deepEqual(g.contrib[5],[0,0],'Line a is posted after Line 1 is settled');assert.deepEqual(g.stacks,[195,195]);
  doBet(g,0,'raise',105);doBet(g,1,'call'); // 100 over the ante on Line 1
  assert.equal(g.betting.line,5);assert.deepEqual(g.contrib[0],[105,105]);
  assert.deepEqual(g.contrib[5],[5,5],'Line a ante comes out of the stacks left after the first betting');assert.deepEqual(g.stacks,[90,90]);
  assert.ok(g.log.some(e=>e.text.startsWith('Line a 完成')&&e.text.endsWith('· ante 5 · pot 10')));
  assert.equal(total(g),400);
  doBet(g,0,'check');doBet(g,1,'check');
  assert.equal(g.done[0].pot,210);assert.equal(g.done[5].pot,10);assert.deepEqual(g.stacks,[310,90]);
  assert.equal(g.over,false);assert.equal(g.phase,'place');assert.equal(total(g),400);
});

test('late antes: after an all-in call on the first of two lines, the second line gets no ante and a lost all-in ends the game at once',()=>{
  const g=newGame({first:'you'});lateTwoLines(g);doPlace(g,0,c('Ah'),0);
  assert.deepEqual(raiseRange(g,0,0),[10,200]);
  doBet(g,0,'raise',200); // all-in over the ante: nothing waits in any other line
  assert.ok(g.contrib.every((x,L)=>L===0||(x[0]===0&&x[1]===0)));assert.equal(total(g),400);
  doBet(g,1,'call');
  assert.deepEqual(g.done[5].contrib,[0,0]);assert.equal(g.done[5].pot,0);assert.equal(g.done[0].pot,400);
  assert.equal(g.over,true);assert.equal(g.winner,0);assert.equal(g.bust,1);assert.equal(g.bustReason,'chips');assert.deepEqual(g.stacks,[400,0]);
  assert.equal(g.left,undefined);assert.ok(g.contrib.every((x,L)=>g.done[L]||(x[0]===0&&x[1]===0)));assert.equal(total(g),400);
});

test('late antes: a decisive all-in ends the game at once with a winner (never a draw); winning it as the short stack plays on',()=>{
  for(const[mode,bust]of[['win0',1],['win1',0]]){
    const g=newGame({first:'you'});lateLine1(g,mode);doPlace(g,0,c('3d'),4);
    doBet(g,0,'raise',200);doBet(g,1,'call');
    assert.equal(g.over,true);assert.ok(g.bust===0||g.bust===1,'someone is out, no draw');assert.equal(g.bust,bust);assert.equal(g.bustReason,'chips');assert.notEqual(g.winner,null);assert.equal(g.winner,1-bust);
    assert.deepEqual(g.stacks,bust===1?[400,0]:[0,400]);assert.equal(g.left,undefined);assert.ok(g.board.some(x=>x===null));
    assert.ok(g.contrib.every((x,L)=>g.done[L]||(x[0]===0&&x[1]===0)),'no chips in undecided lines');
  }
  // the short stack calls all-in and wins: it doubles up and play continues
  const g=newGame({first:'you'});g.stacks=[200,100];lateLine1(g,'win1');doPlace(g,0,c('3d'),4);
  doBet(g,0,'raise',100);doBet(g,1,'call');
  assert.equal(g.over,false);assert.deepEqual(g.stacks,[100,200]);assert.equal(g.phase,'place');
});

test('late antes: the ante doubles every board and is posted on the line when it completes',()=>{
  const g=newGame({first:'you'});assert.equal(g.ante,5);
  endBoard(g);assert.equal(g.boardNo,2);assert.equal(g.ante,10);assert.deepEqual(g.stacks,[200,200]);assert.ok(g.contrib.every(x=>x[0]===0&&x[1]===0));
  assert.deepEqual(g.popups.at(-1).next,{n:2,ante:10,first:1});assert.ok(g.log.some(e=>e.text==='BOARD 2 · ante 10 · 先手 {1}'));
  endBoard(g);assert.equal(g.boardNo,3);assert.equal(g.ante,20);assert.equal(g.minRaise,20);assert.deepEqual(g.boards.map(b=>b.ante),[5,10]);
  g.stacks=[200,12];lateLine1(g,'win0');doPlace(g,0,c('3d'),4); // seat 1 can post only 12 of the 20
  assert.deepEqual(g.done[0].contrib,[12,12]);assert.equal(g.over,true);assert.equal(g.bust,1);
  // out of chips when a board ends: loses (stack 0 and nothing anywhere else)
  const h=newGame({first:'you'});h.stacks=[400,0];endBoard(h);assert.equal(h.over,true);assert.equal(h.bust,1);assert.equal(h.bustReason,'chips');
});

test('late antes: two lines completed together, a fold on Line 1 pays out before the Line a ante is posted',()=>{
  const g=newGame({first:'you'});g.stacks=[8,200];lateTwoLines(g);doPlace(g,0,c('Ah'),0);
  assert.deepEqual(g.stacks,[3,195]);assert.deepEqual(g.contrib[0],[5,5]);assert.deepEqual(g.contrib[5],[0,0]);
  doBet(g,0,'raise',8); // all-in over the ante (3 more)
  assert.deepEqual(g.stacks,[0,195]);assert.deepEqual(g.contrib[0],[8,5]);
  doBet(g,1,'fold');
  assert.equal(g.done[0].winner,0);assert.equal(g.done[0].pot,10);assert.equal(g.done[0].ret,3);assert.deepEqual(g.done[0].contrib,[5,5]);
  assert.equal(g.betting.line,5);assert.deepEqual(g.contrib[5],[5,5],'Line a ante is posted from the stacks after the payout (0 + 3 + 10 = 13, not 0)');
  assert.deepEqual(g.stacks,[8,190]);assert.equal(g.over,false);assert.equal(total(g),208);
  doBet(g,0,'check');doBet(g,1,'check');
  assert.equal(g.done[5].winner,0);assert.deepEqual(g.stacks,[18,190]);assert.equal(g.over,false);assert.equal(g.phase,'place');assert.equal(total(g),208);
});

// two lines completed together (as lateTwoLines), with chosen hands: seat 0 [Ah + 3 more] (the deck top is its draw), seat 1 h1
function lateTwoLinesHands(g,h0,draw,h1){
  lateTwoLines(g);g.hands=[h0.map(c),h1.map(c)];g.deck=[c(draw)];
}
test('late antes: two lines completed together, Line 1 betting leaves 3 chips: Line a posts 3 each, all-in, no betting, out after both showdowns',()=>{
  const g=newGame({first:'you'});g.stacks=[200,13];lateTwoLines(g);doPlace(g,0,c('Ah'),0);
  assert.deepEqual(g.stacks,[195,8]);
  doBet(g,0,'check');doBet(g,1,'raise',10);
  assert.deepEqual(g.stacks,[195,3]);doBet(g,0,'call');
  assert.equal(g.over,true,'no betting is possible on Line a: it checks through and both lines go to showdown at once');
  assert.equal(g.log.filter(e=>/ SD · /.test(e.text)).length,2,'both lines were shown down');
  assert.deepEqual(g.done[0].contrib,[10,10]);assert.deepEqual(g.done[5].contrib,[3,3]);assert.equal(g.done[0].winner,0);assert.equal(g.done[5].winner,0);
  assert.equal(g.bust,1);assert.equal(g.winner,0);assert.equal(g.bustReason,'chips');assert.deepEqual(g.stacks,[213,0]);assert.equal(g.left,undefined);
  assert.ok(g.log.some(e=>e.text.startsWith('Line a 完成')&&e.text.endsWith('· ante 3 · all-in · pot 6')));
});
test('late antes: two lines completed together, the all-in short stack wins Line 1 but loses Line a: it plays on with the Line 1 pot',()=>{
  const g=newGame({first:'you'});g.stacks=[200,13];
  lateTwoLinesHands(g,['Ah','9c','8c','4s'],'6s',['3s','3h','7s','5d']);
  const l1=[c('Ah'),c('Kh'),c('Qh'),c('2c'),c('3d')],la=[c('Ah'),c('Ac'),c('Kc'),c('Qc'),c('2d')];
  const h0=['9c','8c','4s','6s'].map(c); // seat 0's hand once Ah is placed and 6s drawn
  assert.ok(bestHole(l1,h0).v<bestHole(l1,g.hands[1]).v,'seat 1 wins Line 1 (trip threes)');
  assert.ok(bestHole(la,h0).v>bestHole(la,g.hands[1]).v,'seat 0 wins Line a (club flush)');
  doPlace(g,0,c('Ah'),0);doBet(g,0,'check');doBet(g,1,'raise',10);doBet(g,0,'call');
  assert.equal(g.done[0].winner,1);assert.equal(g.done[0].pot,20);assert.equal(g.done[5].winner,0);assert.equal(g.done[5].pot,6);
  assert.deepEqual(g.stacks,[193,20]);assert.equal(g.over,false);assert.equal(g.phase,'place');assert.equal(total(g),213);
});

test('fill (comparison, saved games): antes are still posted on all lines when the board starts, and the logs say so',()=>{
  const g=newGame(FILL);
  assert.ok(g.log.some(e=>e.text==='BOARD 1 · ante 5×10 · 先手 {0}'));assert.deepEqual(g.stacks,[150,150]);assert.ok(g.contrib.every(x=>x[0]===5&&x[1]===5));
  lateLine1(g,'win0');g.stacks=[150,150];doPlace(g,0,c('3d'),4);
  assert.deepEqual(g.contrib[0],[5,5],'no extra ante on completion');assert.deepEqual(g.stacks,[150,150]);
  assert.equal(g.log.at(-1).text,'Line 1 完成 · A♥ K♥ Q♥ 2♣ 3♦ · pot 10');
});

test('a game saved before the freezeout rules continues as board 1',()=>{
  const g=newGame({first:'you'});for(const k of['boardNo','boards','ante','minRaise','boardStart'])delete g[k];g.cfg.minRaise=5;
  migrate(g);assert.equal(g.boardNo,1);assert.equal(g.ante,5);assert.equal(g.minRaise,5);assert.deepEqual(g.boardStart,[200,200]);
});
