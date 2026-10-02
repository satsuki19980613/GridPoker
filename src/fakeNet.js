// Development only (npm run dev, http://localhost:5173/?fake): a stand-in for the backend so the VS Player screens can be
// checked without signing in. The real server rules (server/game/rules.js) run here and a CPU plays the other seat.
// Options: ?fake&seat=1 (you are seat 1) · &idle (the bot never moves: time-outs) · &turn=8000 (turn time in ms)
import{applyRequest,viewsOf,eloDelta,createGame,MoveError,TURN_MS}from'../server/game/rules.js';
import{actor}from'./engine.js';
import{cpuMove}from'./cpu.js';

const q=new URLSearchParams(location.search);
const MY_SEAT=q.get('seat')==='1'?1:0,BOT_SEAT=1-MY_SEAT,IDLE=q.has('idle'),TURN=+(q.get('turn')||TURN_MS);
const me={nickname:'Satsuki',rating:1500,games:0,wins:0,losses:0,draws:0};
const bot={uid:'00000000-0000-4000-8000-0000000000b0',nickname:'Bot-Alpha',rating:1532};
let G=null; // {id,state,ver,deadline,strikes,meta,views,status}
const lag=v=>new Promise(r=>setTimeout(()=>r(structuredClone(v)),120+Math.random()*120));
class FakeError extends Error{constructor(code){super(code);this.code=code}}

export const online=true;
export const onSessionLost=()=>{};
export async function currentUser(){return{id:'me'}}
export async function signIn(){}
export async function signOut(){}

function save(state,strikes){
  G.ver++;G.state=state;G.strikes=strikes;G.deadline=state.over?null:Date.now()+TURN;
  let result=null;
  if(state.over){
    const r=[0,0];r[MY_SEAT]=me.rating;r[BOT_SEAT]=bot.rating;const d=eloDelta(r[0],r[1],state.winner);
    me.rating+=d[MY_SEAT];bot.rating+=d[BOT_SEAT];me.games++;
    if(state.winner===null)me.draws++;else if(state.winner===MY_SEAT)me.wins++;else me.losses++;
    result={delta:d,after:[r[0]+d[0],r[1]+d[1]]};G.status='over';
  }
  G.meta={...G.meta,deadline:G.deadline,strikes,ver:G.ver,result};
  G.views=viewsOf(state,G.meta);
}
// the bot plays its seat from the full state (it is only a test opponent)
setInterval(()=>{
  if(!G||G.status!=='active'||IDLE||actor(G.state)!==BOT_SEAT)return;
  const s=structuredClone(G.state);cpuMove(s,BOT_SEAT);save(s,[0,0]);
},1400);

export async function rpc(name,args={}){
  if(name==='me')return lag({...me,game:G&&G.status==='active'?G.id:null});
  if(name==='set_nickname'){const v=String(args.p_name||'').trim();if(!v||v.length>16)throw new FakeError('nickname_invalid');if(v.toLowerCase()==='bot-alpha')throw new FakeError('nickname_taken');me.nickname=v;return lag({nickname:v})}
  if(name==='lobby_poll')return lag({game:G&&G.status==='active'?G.id:null,players:args.p_wait&&!(G&&G.status==='active')?[{uid:bot.uid,nickname:bot.nickname,rating:bot.rating}]:[]});
  if(name==='game_poll'){if(!G||args.p_game!==G.id)throw new FakeError('not_found');return lag({ver:G.ver,now:Date.now(),view:G.ver>args.p_ver?G.views[MY_SEAT]:null})}
  if(name==='ranking'){
    const rows=[{nickname:bot.nickname,rating:bot.rating,wins:7,losses:3,draws:0},{nickname:'Kei',rating:1611,wins:21,losses:9,draws:1},{nickname:'Mio',rating:1488,wins:4,losses:6,draws:0}];
    if(me.games)rows.push({nickname:me.nickname,rating:me.rating,wins:me.wins,losses:me.losses,draws:me.draws,me:true});
    rows.sort((a,b)=>b.rating-a.rating);rows.forEach((r,i)=>r.rank=i+1);
    return lag({top:rows,me:rows.find(r=>r.me)||null});
  }
  throw new FakeError('unknown_rpc');
}

export async function game(body){
  await lag(null);
  if(body.op==='match'){
    if(G&&G.status==='active')return{game:G.id};
    const state=createGame(),id=crypto.randomUUID(),names=[0,0],ratings=[0,0];
    names[MY_SEAT]=me.nickname;names[BOT_SEAT]=bot.nickname;ratings[MY_SEAT]=me.rating;ratings[BOT_SEAT]=bot.rating;
    G={id,state,ver:0,strikes:[0,0],status:'active',meta:{game:id,names,ratings,result:null}};save(state,[0,0]);
    return{game:id};
  }
  if(!G||body.game!==G.id)throw new FakeError('not_found');
  if(G.status!=='active')throw new FakeError('game_over');
  try{
    const r=applyRequest({state:G.state,ver:G.ver,deadline:G.deadline,strikes:G.strikes},MY_SEAT,body,Date.now());
    save(r.state,r.strikes);
  }catch(e){throw new FakeError(e instanceof MoveError?e.code:'illegal')}
  return{ver:G.ver,now:Date.now(),view:structuredClone(G.views[MY_SEAT])};
}
