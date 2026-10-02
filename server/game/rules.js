// VS Player game rules on top of the engine: settings, turn clock, ratings, applying a request to a stored game.
import{newGame,actor,doPlace,doBet,autoMove,forfeit}from'../../src/engine.js';
import{viewFor}from'../../src/view.js';

export const PVP_CFG={stack:200,ante:5,minRaiseMode:'fixed',first:'random'};
export const TURN_MS=60_000;      // time to act
export const REVEAL_MS=6_000;     // extra time when lines were completed (board reveal and result windows)
export const GRACE_MS=1_500;      // a time-out can be claimed this long after the deadline
export const MAX_STRIKES=3;       // consecutive time-outs that lose the game
export const K=32;                // Elo K-factor

export function createGame(){return newGame(PVP_CFG)}

// Elo: score from seat 0's point of view (1 win, 0.5 draw, 0 loss)
export function eloDelta(r0,r1,winner){
  const e0=1/(1+10**((r1-r0)/400)),s0=winner===null?.5:winner===0?1:0,d=Math.round(K*(s0-e0));
  return[d,-d];
}

export class MoveError extends Error{constructor(code){super(code);this.code=code}}

// apply one request to the stored game; returns the new state and strikes. Throws MoveError for anything illegal.
export function applyRequest(game,seat,req,now){
  const g=structuredClone(game.state),strikes=[...game.strikes];
  if(g.over)throw new MoveError('game_over');
  if(req.op==='resign'){forfeit(g,seat,'resign');return{state:g,strikes}}
  if(req.op==='timeout'){
    const p=actor(g);
    if(p===null||now<game.deadline+GRACE_MS)throw new MoveError('not_yet');
    strikes[p]++;
    if(strikes[p]>=MAX_STRIKES)forfeit(g,p,'timeout');else autoMove(g,p);
    return{state:g,strikes};
  }
  if(req.op!=='act')throw new MoveError('bad_request');
  if(req.ver!==game.ver)throw new MoveError('stale');
  if(actor(g)!==seat)throw new MoveError('not_your_turn');
  const m=req.move||{};
  try{
    if(m.type==='place'&&g.phase==='place'&&Number.isInteger(m.card)&&Number.isInteger(m.cell)&&m.cell>=0&&m.cell<25)doPlace(g,seat,m.card,m.cell);
    else if(m.type==='bet'&&g.phase==='betting'&&['fold','call','check','raise'].includes(m.act)&&(m.act!=='raise'||Number.isInteger(m.to)))doBet(g,seat,m.act,m.to);
    else throw new MoveError('illegal');
  }catch(e){if(e instanceof MoveError)throw e;throw new MoveError('illegal')}
  strikes[seat]=0;
  return{state:g,strikes};
}

// deadline for whoever acts next
export function nextDeadline(before,after,now){
  if(after.over)return null;
  return now+TURN_MS+(after.popups.length>before.popups.length?REVEAL_MS:0);
}

// the two stored views (what each seat may see) plus the shared meta
export function viewsOf(g,meta){
  return[0,1].map(seat=>({...viewFor(g,seat),meta:{...meta,seat}}));
}
