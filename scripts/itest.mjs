// Integration test against a Neon branch (dev only): two test users wait, match, play a whole game through the
// server's database layer, and the ratings are updated. RPCs are called the way the Data API calls them
// (role authenticated + request.jwt.claims). Test users are removed at the end.
import pg from'pg';
import{branchArg,connectionString}from'./neon.mjs';
import{makeDb}from'../server/game/db.js';
import{actor}from'../src/engine.js';
import{cpuMove}from'../src/cpu.js';

const branch=branchArg();if(branch==='production'){console.error('production では実行しない');process.exit(2)}
const pool=new pg.Pool({connectionString:await connectionString(branch),max:3});
const U=['00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2'];
const ok=(c,m)=>{if(!c)throw new Error('FAIL '+m);console.log('ok  '+m)};
async function rpc(uid,sql,args=[]){
  const c=await pool.connect();
  try{await c.query('begin');await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid,role:'authenticated'})]);
    const r=await c.query(sql,args);await c.query('commit');return r.rows[0]?Object.values(r.rows[0])[0]:null}
  catch(e){await c.query('rollback');throw e}finally{c.release()}
}
const clean=()=>pool.query('delete from neon_auth."user" where id=any($1::uuid[])',[U]);
try{
  await clean();
  await pool.query(`insert into neon_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") values ($1,'t1','t1@example.test',false,now(),now()),($2,'t2','t2@example.test',false,now(),now())`,U);
  // anonymous / other tables are closed
  let denied=false;try{await rpc(U[0],'select count(*) from public.games')}catch{denied=true}ok(denied,'authenticated cannot read games directly');
  const m0=await rpc(U[0],'select public.me()'),m1=await rpc(U[1],'select public.me()');
  ok(/^Player-[0-9A-F]{4}$/.test(m0.nickname)&&m0.rating===1500&&m0.game===null,'me() creates a profile '+m0.nickname);
  ok((await rpc(U[0],'select public.set_nickname($1)',['ItestA'])).nickname==='ItestA','set_nickname');
  let taken=false;try{await rpc(U[1],'select public.set_nickname($1)',['itesta'])}catch(e){taken=/nickname_taken/.test(e.message)}ok(taken,'nickname unique (case-insensitive)');
  await rpc(U[1],'select public.set_nickname($1)',['ItestB']);
  const l0=await rpc(U[1],'select public.lobby_poll(true)');ok(l0.game===null,'B waits');
  const l1=await rpc(U[0],'select public.lobby_poll(true)');ok(l1.players.some(p=>p.nickname==='ItestB'),'A sees B in the lobby');
  const db=makeDb(pool);
  const {game}=await db.match(U[0],U[1]);ok(!!game,'A starts a game with B');
  const again=await db.match(U[0],U[1]);ok(again.game===game,'second match returns the same game');
  ok((await rpc(U[1],'select public.lobby_poll(true)')).game===game,'B learns the game from the lobby');
  // play out with CPU logic choosing moves from each seat's own view
  let v=[await rpc(U[0],'select public.game_poll($1,-1)',[game]),await rpc(U[1],'select public.game_poll($1,-1)',[game])].map(x=>x.view);
  ok(v[0].hands[1].every(c=>c===null)&&v[1].hands[0].every(c=>c===null)&&!v[0].deck,'views hide the other hand and the deck');
  let steps=0,stale=false;
  while(!v[0].over&&steps++<400){
    const seat=actor(v[0]),g=structuredClone(v[seat]);
    // pick a move with the CPU on the seat's own view (opponent cards are unknown there)
    const before={place:g.phase==='place'};const snap=JSON.stringify(g.board);
    let move;
    if(g.phase==='place'){const h0=[...g.hands[seat]];cpuMove(fill(g),seat);const cell=g.board.findIndex((b,i)=>b&&JSON.parse(snap)[i]===null);move={type:'place',card:g.board[cell].card,cell}}
    else{const L=g.betting.line,h=g.hist[L].length;cpuMove(fill(g),seat);const last=g.hist[L][h];move={type:'bet',act:{'ベット':'raise','レイズ':'raise','コール':'call','チェック':'check','フォールド':'fold'}[last.a],to:last.to}}
    if(steps===3){try{await db.play(U[seat],game,{op:'act',ver:v[0].meta.ver-1,move})}catch(e){stale=e.code==='stale'}}
    const r=await db.play(U[seat],game,{op:'act',ver:v[0].meta.ver,move});
    const o=await rpc(U[1-seat],'select public.game_poll($1,$2)',[game,v[0].meta.ver]);
    v[seat]=r.view;v[1-seat]=o.view;
  }
  ok(stale,'stale version is rejected');
  ok(v[0].over&&v[1].over,`game over after ${steps} moves · stacks ${v[0].stacks}`);
  const res=v[0].meta.result;ok(res&&res.delta[0]===-res.delta[1],'rating delta '+res.delta);
  const p=await rpc(U[0],'select public.me()');ok(p.games===1&&p.rating===1500+res.delta[0]&&p.game===null,'profile updated');
  const rk=await rpc(U[0],'select public.ranking()');ok(rk.top.some(r=>r.nickname==='ItestA'&&r.me)&&rk.me.nickname==='ItestA','ranking lists A');
  let nf=false;try{await rpc(U[0],'select public.game_poll($1,-1)',['00000000-0000-4000-8000-000000000000'])}catch(e){nf=/not_found/.test(e.message)}ok(nf,'unknown game is not_found');
  // a second game: resign and time-out
  await rpc(U[1],'select public.lobby_poll(true)');const g2=(await db.match(U[0],U[1])).game;
  let early=false;try{await db.play(U[0],g2,{op:'timeout'})}catch(e){early=e.code==='not_yet'}ok(early,'time-out before the deadline is refused');
  await pool.query('update public.games set deadline_ms=$2 where id=$1',[g2,Date.now()-5000]);
  const t=await db.play(U[1],g2,{op:'timeout'});ok(t.view.meta.strikes.some(x=>x===1),'time-out auto-moves for the player to act');
  const rs=await db.play(U[1],g2,{op:'resign'});ok(rs.view.over&&rs.view.winner===0&&rs.view.forfeit.reason==='resign','resign ends the game');
  // games are deleted 7 days after their last change (finished or abandoned)
  await rpc(U[1],'select public.lobby_poll(true)');const g3=(await db.match(U[0],U[1])).game;
  await pool.query("update public.games set updated_at=now()-interval '8 days' where id=any($1::uuid[])",[[game,g3]]);
  await pool.query("update public.games set updated_at=now()-interval '6 days' where id=$1",[g2]);
  await rpc(U[0],'select public.me()');
  const left=(await pool.query('select id from public.games where id=any($1::uuid[])',[[game,g2,g3]])).rows.map(r=>r.id);
  ok(!left.includes(game)&&!left.includes(g3)&&left.includes(g2),'me() deletes games older than 7 days (finished and abandoned), keeps newer ones');
  const p2=await rpc(U[0],'select public.me()');ok(p2.game===null&&p2.games===2,'purge does not touch ratings or records');
  let denied2=false;try{await rpc(U[0],'select public.purge_old_games()')}catch{denied2=true}ok(denied2,'players cannot call purge_old_games directly');
}finally{await clean();await pool.end()}
// the CPU needs an opponent hand of the right size; unknown cards stay unknown (null) and are only counted
function fill(g){g.deck=Array(60).fill(0);return g}
