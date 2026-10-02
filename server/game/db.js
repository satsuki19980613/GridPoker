// Database side of the game server (runs as the database owner through DATABASE_URL). Each request is one transaction
// with the game row locked, so the two players' requests are applied one at a time.
import{randomUUID}from'node:crypto';
import{MoveError,createGame,applyRequest,nextDeadline,viewsOf,eloDelta,TURN_MS}from'./rules.js';

const LOBBY_FRESH="interval '12 seconds'";

async function tx(pool,fn){
  const c=await pool.connect();
  try{await c.query('begin');const r=await fn(c);await c.query('commit');return r}
  catch(e){await c.query('rollback').catch(()=>{});throw e}
  finally{c.release()}
}

export function makeDb(pool){
  return{
    // start a game against a waiting player
    match:(uid,target)=>tx(pool,async c=>{
      for(const u of[uid,target].sort())await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[u]);
      const act=await c.query("select id,p0,p1 from public.games where status='active' and (p0=any($1::uuid[]) or p1=any($1::uuid[]))",[[uid,target]]);
      const mine=act.rows.find(r=>r.p0===uid||r.p1===uid);
      if(mine)return{game:mine.id};
      if(act.rowCount)throw new MoveError('gone');
      const l=await c.query(`select 1 from public.lobby where uid=$1 and seen_at>now()-${LOBBY_FRESH}`,[target]);
      if(!l.rowCount)throw new MoveError('gone');
      const pr=await c.query('select uid,nickname,rating from public.profiles where uid=any($1::uuid[])',[[uid,target]]);
      const P0=pr.rows.find(r=>r.uid===uid),P1=pr.rows.find(r=>r.uid===target);
      if(!P0)throw new MoveError('no_profile');if(!P1)throw new MoveError('gone');
      const id=randomUUID(),g=createGame(),deadline=Date.now()+TURN_MS;
      const meta={game:id,names:[P0.nickname,P1.nickname],ratings:[P0.rating,P1.rating],deadline,strikes:[0,0],ver:1,result:null};
      const[v0,v1]=viewsOf(g,meta);
      await c.query("insert into public.games(id,p0,p1,state,ver,view0,view1,deadline_ms,strikes) values($1,$2,$3,$4,1,$5,$6,$7,'{0,0}')",[id,uid,target,JSON.stringify(g),JSON.stringify(v0),JSON.stringify(v1),deadline]);
      await c.query('delete from public.lobby where uid=any($1::uuid[])',[[uid,target]]);
      return{game:id};
    }),

    // act / timeout / resign on a game the caller plays in
    play:(uid,gameId,req)=>tx(pool,async c=>{
      const r=await c.query("select p0,p1,status,state,ver,deadline_ms,strikes,view0->'meta' as meta from public.games where id=$1 for update",[gameId]);
      const row=r.rows[0];const seat=row?row.p0===uid?0:row.p1===uid?1:null:null;
      if(seat===null)throw new MoveError('not_found');
      if(row.status!=='active')throw new MoveError('game_over');
      const now=Date.now();
      const{state,strikes}=applyRequest({state:row.state,ver:row.ver,deadline:Number(row.deadline_ms),strikes:row.strikes},seat,req,now);
      const ver=row.ver+1,deadline=nextDeadline(row.state,state,now);
      let result=null;
      if(state.over){
        const pr=await c.query('select uid,rating from public.profiles where uid=any($1::uuid[]) for update',[[row.p0,row.p1]]);
        const r0=pr.rows.find(x=>x.uid===row.p0)?.rating??1500,r1=pr.rows.find(x=>x.uid===row.p1)?.rating??1500;
        const d=eloDelta(r0,r1,state.winner);
        for(const[s,u]of[[0,row.p0],[1,row.p1]]){
          const res=state.winner===null?'draws':state.winner===s?'wins':'losses';
          await c.query(`update public.profiles set rating=rating+$2,games=games+1,${res}=${res}+1 where uid=$1`,[u,d[s]]);
        }
        result={delta:d,after:[r0+d[0],r1+d[1]]};
      }
      const meta={...row.meta,deadline,strikes,ver,result};
      const views=viewsOf(state,meta);
      await c.query(`update public.games set state=$2,ver=$3,view0=$4,view1=$5,deadline_ms=$6,strikes=$7,status=$8,winner=$9,updated_at=now() where id=$1`,
        [gameId,JSON.stringify(state),ver,JSON.stringify(views[0]),JSON.stringify(views[1]),deadline,strikes,state.over?'over':'active',state.over?state.winner:null]);
      return{ver,now,view:views[seat]};
    }),
  };
}
