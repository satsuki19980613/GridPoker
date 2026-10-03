// Rules engine: whole games with the CPU and with random legal actions keep every invariant.
import{test}from'node:test';
import assert from'node:assert/strict';
import{newGame,actor,doBet,bettingLegal,raiseRange,eval5,bestHole,autoMove,forfeit,endBoard,migrate}from'../src/engine.js';
import{cpuMove}from'../src/cpu.js';

const CFGS=[{stack:200,ante:5,minRaiseMode:'fixed'},{stack:200,ante:5,minRaiseMode:'last'},{stack:100,ante:5,minRaiseMode:'fixed'},{stack:100,ante:1,minRaiseMode:'last'},{stack:300,ante:10,minRaiseMode:'fixed'}];
const c=s=>{const r='23456789TJQKA'.indexOf(s[0]),u='shdc'.indexOf(s[1]);return r*4+u};

function play(fuzz,i){
  const cfg={...CFGS[i%CFGS.length],first:'random'},g=newGame(cfg),total=2*cfg.stack;let steps=0;
  while(!g.over&&steps++<5000){
    const p=actor(g);
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
  }
  assert.ok(g.over,'game finishes');
  // freezeout: a game only ends when a player is out
  assert.ok(g.bust===0||g.bust===1||g.bust===null,'someone is out');
  if(g.bust!==null)assert.equal(g.winner,1-g.bust);
  // the loser has no chips anywhere (stack and undecided lines); every chip is accounted for
  let left=g.stacks[0]+g.stacks[1];for(let L=0;L<10;L++)if(!g.done[L])left+=g.contrib[L][0]+g.contrib[L][1];
  assert.equal(left,total);
  if(g.bustReason==='chips'){
    if(g.bust!==null){assert.equal(g.stacks[g.bust],0);for(let L=0;L<10;L++)if(!g.done[L])assert.equal(g.contrib[L][g.bust],0)}
  }else{
    assert.equal(g.bustReason,'ante');assert.ok(g.stacks[g.bust]<10,'cannot post 1 on every line');
    assert.equal(g.stacks[0]+g.stacks[1],total);
  }
  // boards: the ante doubles every board (a short stack goes all-in line by line instead of lowering it)
  g.boards.forEach((b,i)=>{assert.equal(b.n,i+1);assert.equal(b.ante,cfg.ante*2**i)});
  assert.ok(g.log.every(e=>!/\b(YOU|CPU)\b/.test(e.text)),'shared log text names seats only as {0}/{1}');
  return g;
}

test('200 games CPU vs CPU',()=>{for(let i=0;i<200;i++)play(false,i)});
test('200 games with random legal actions and time-outs',()=>{
  let busts=0;for(let i=0;i<200;i++)if(play(true,i).bust!==undefined)busts++;
  assert.ok(busts>0,'some games end early with a stack of 0');
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

test('time-out move: random placement, or check / fold',()=>{
  const g=newGame({first:'you'});autoMove(g,0);
  assert.equal(g.board.filter(Boolean).length,1);assert.equal(g.hands[0].length,4);
  assert.throws(()=>autoMove(g,0),/not your turn/);
});

test('No Limit: bet up to all-in, capped at what the opponent can cover; limit pot keeps the old cap',()=>{
  const g=newGame({first:'you'});
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

test('freezeout: a full board carries the stacks over, doubles the ante and swaps the first player',()=>{
  const g=newGame({first:'you'});assert.equal(g.boardNo,1);assert.equal(g.ante,5);assert.deepEqual(g.stacks,[150,150]);
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

test('anteMode even (comparison): the ante drops to the short stack ÷ 10; under 10 chips loses',()=>{
  const g=newGame({first:'you',anteMode:'even'});
  g.stacks=[230,120];endBoard(g);g.stacks=[275,115];endBoard(g);assert.equal(g.ante,11);assert.deepEqual(g.stacks,[165,5]);
  g.stacks=[391,9];endBoard(g);assert.equal(g.over,true);assert.equal(g.bust,1);assert.equal(g.bustReason,'ante');
});

// Line 1 complete with fixed cards: seat 0 holds the nuts, seat 1 junk (swap the hands with swap=true)
function line1(g,swap){
  const k=c=>'23456789TJQKA'.indexOf(c[0])*4+'shdc'.indexOf(c[1]);
  for(let i=0;i<5;i++)g.board[i]={card:k(['Ah','Kh','Qh','2c','3d'][i]),owner:i%2,rev:true};
  const h=[['Jh','Th','4s','5s'].map(k),['7c','8d','9s','6c'].map(k)];g.hands=swap?[h[1],h[0]]:h;
  g.phase='betting';g.queue=[0];g.pendingSd=[];g.betting={line:0,toAct:0,mode:'open',checks:0,raises:0};
}
test('stack 0 is all-in, not out: no betting on the line, and winning it plays on',()=>{
  const g=newGame({first:'you'});g.stacks=[290,0];line1(g,true);
  assert.equal(bettingLegal(g).raise,null,'nothing to bet against an all-in player');
  doBet(g,0,'check'); // the all-in player checks automatically; showdown
  assert.ok(g.done[0],'line decided');assert.equal(g.over,false);assert.equal(g.stacks[1],10);assert.equal(g.phase,'place');
});

test('all-in and lost: out at once even with antes left in other lines; those pots go to the winner',()=>{
  const g=newGame({first:'you'});g.stacks=[290,0];line1(g,false);
  doBet(g,0,'check');
  assert.equal(g.over,true);assert.equal(g.winner,0);assert.equal(g.bust,1);assert.equal(g.bustReason,'chips');
  assert.deepEqual(g.stacks,[390,0]); // 290 + every pot (5+5 on 10 lines)assert.ok(g.contrib.every(c=>c[0]===0&&c[1]===0),'undecided pots swept to the winner');
  assert.ok(g.board.some(x=>x===null),'ended mid-board');
});

test('no chips anywhere ends the game at once, even mid-board',()=>{
  const g=newGame({first:'you'});g.stacks=[390,0];g.contrib=g.contrib.map((c,L)=>L===0?[5,5]:[0,0]); // all-in on Line 1 only
  for(let i=0;i<5;i++)g.board[i]={card:g.deck.pop(),owner:i%2,rev:true};
  g.hands[0]=[];g.hands[1]=[]; // fix the showdown: seat 0 holds the nuts against seat 1's junk
  const k=c=>'23456789TJQKA'.indexOf(c[0])*4+'shdc'.indexOf(c[1]);
  g.board.slice(0,5).forEach((b,i)=>{b.card=k(['Ah','Kh','Qh','2c','3d'][i])});g.hands=[['Jh','Th','4s','5s'].map(k),['7c','8d','9s','6c'].map(k)];
  g.phase='betting';g.queue=[0];g.pendingSd=[];g.betting={line:0,toAct:0,mode:'open',checks:0,raises:0};
  doBet(g,0,'check');
  assert.equal(g.over,true);assert.equal(g.winner,0);assert.equal(g.bustReason,'chips');assert.ok(g.board.some(x=>x===null),'ended mid-board');
});

test('a game saved before the freezeout rules continues as board 1',()=>{
  const g=newGame({first:'you'});for(const k of['boardNo','boards','ante','minRaise','boardStart'])delete g[k];g.cfg.minRaise=5;
  migrate(g);assert.equal(g.boardNo,1);assert.equal(g.ante,5);assert.equal(g.minRaise,5);assert.deepEqual(g.boardStart,[200,200]);
});
