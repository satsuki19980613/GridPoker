// Rules engine: whole games with the CPU and with random legal actions keep every invariant.
import{test}from'node:test';
import assert from'node:assert/strict';
import{newGame,actor,doBet,bettingLegal,eval5,bestHole,autoMove,forfeit}from'../src/engine.js';
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
  if(g.bust!==undefined){
    // ended early: the busted seat has 0 and loses; undecided lines hold only their antes
    assert.equal(g.stacks[g.bust],0);assert.equal(g.winner,1-g.bust);
    for(let L=0;L<10;L++)if(!g.done[L])assert.deepEqual(g.contrib[L],[cfg.ante,cfg.ante]);
  }else{
    assert.ok(g.board.every(x=>x!==null),'board is full');
    assert.ok(g.done.every(Boolean),'every line is resolved');
    assert.equal(g.stacks[0]+g.stacks[1],total);
    assert.ok(g.stacks[0]>0&&g.stacks[1]>0,'a stack of 0 ends the game earlier');
  }
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
