// VS Player server: views never leak hidden cards; requests are validated; HTTP behaviour (CORS, auth, routing).
import{test}from'node:test';
import assert from'node:assert/strict';
import{newGame,actor,cardStr}from'../src/engine.js';
import{cpuMove}from'../src/cpu.js';
import{viewFor,logText}from'../src/view.js';
import{applyRequest,eloDelta,nextDeadline,MoveError,TURN_MS,REVEAL_MS,GRACE_MS}from'../server/game/rules.js';
import{createHandler}from'../server/game/handler.js';
import{firstPartyCookie,authCookies,isProxiedPath}from'../src/authProxy.js';

test('a seat never sees the deck, the other hand, the other face-down cards or the other private log',()=>{
  for(let i=0;i<60;i++){
    const g=newGame({first:'random'});
    while(!g.over){
      cpuMove(g,actor(g));
      for(const s of[0,1]){
        const v=viewFor(g,s),o=1-s,txt=JSON.stringify(v);
        assert.equal(v.deck,undefined);
        assert.ok(v.hands[o].every(x=>x===null));
        assert.equal(v.lastDraw[o],null);
        const secret=[...g.hands[o],...g.board.filter(b=>b&&b.owner===o&&!b.rev).map(b=>b.card)];
        const shown=new Set([...v.hands[s],...v.board.filter(b=>b&&b.card!==null).map(b=>b.card)]);
        for(const x of secret)assert.ok(!shown.has(x),'hidden card '+cardStr(x)+' shown');
        assert.ok(v.log.every(e=>!e.priv||e.priv[o]===undefined));
        assert.ok(!txt.includes('"deck"'));
      }
    }
  }
});

test('log text from each seat',()=>{
  const e={text:'{1} 配置 c3',who:1,priv:{1:' A♠ · draw 2♦'}};
  assert.equal(logText(e,1,'OPP'),'YOU 配置 c3 A♠ · draw 2♦');
  assert.equal(logText({text:e.text,who:1},0,'OPP'),'OPP 配置 c3');
});

test('Elo: equal ratings move 16, sums to zero, draw between equals is 0',()=>{
  assert.deepEqual(eloDelta(1500,1500,0),[16,-16]);
  assert.deepEqual(eloDelta(1500,1500,1),[-16,16]);
  assert.deepEqual(eloDelta(1500,1500,null),[0,-0]);
  const[d0,d1]=eloDelta(1700,1500,0);assert.ok(d0>0&&d0<16&&d0+d1===0);
});

test('requests: stale version, wrong seat, illegal move, early time-out are refused',()=>{
  const state=newGame({first:'you'}),game={state,ver:5,deadline:1000,strikes:[0,0]};
  const card=state.hands[0][0];
  assert.throws(()=>applyRequest(game,0,{op:'act',ver:4,move:{type:'place',card,cell:0}},0),e=>e.code==='stale');
  assert.throws(()=>applyRequest(game,1,{op:'act',ver:5,move:{type:'place',card,cell:0}},0),e=>e.code==='not_your_turn');
  assert.throws(()=>applyRequest(game,0,{op:'act',ver:5,move:{type:'place',card:state.hands[1][0],cell:0}},0),e=>e.code==='illegal');
  assert.throws(()=>applyRequest(game,0,{op:'act',ver:5,move:{type:'bet',act:'check'}},0),e=>e.code==='illegal');
  assert.throws(()=>applyRequest(game,0,{op:'timeout'},1000+GRACE_MS-1),e=>e.code==='not_yet');
  const ok=applyRequest(game,0,{op:'act',ver:5,move:{type:'place',card,cell:0}},0);
  assert.equal(ok.state.board[0].card,card);assert.equal(game.state.board[0],null,'stored state is not mutated');
});

test('three consecutive time-outs lose the game; acting resets the count',()=>{
  let game={state:newGame({first:'you'}),ver:1,deadline:0,strikes:[0,0]};
  const t=()=>{const r=applyRequest(game,1,{op:'timeout'},10**9);game={...game,state:r.state,strikes:r.strikes,ver:game.ver+1}};
  t();assert.deepEqual(game.strikes,[1,0]);
  // seat 1 acts normally
  const s=game.state,r=applyRequest(game,1,{op:'act',ver:game.ver,move:{type:'place',card:s.hands[1][0],cell:s.board.findIndex(b=>b===null)}},0);
  game={...game,state:r.state,strikes:r.strikes,ver:game.ver+1};
  t();t();assert.equal(game.state.over,false);t();
  assert.equal(game.state.over,true);assert.equal(game.state.winner,1);assert.equal(game.state.forfeit.reason,'timeout');
  assert.throws(()=>applyRequest(game,0,{op:'resign'},0),e=>e.code==='game_over');
});

test('deadline: one turn, plus reveal time when a line was completed',()=>{
  const a=newGame({first:'you'}),b=structuredClone(a);
  assert.equal(nextDeadline(a,b,0),TURN_MS);
  b.popups.push({});assert.equal(nextDeadline(a,b,0),TURN_MS+REVEAL_MS);
  b.over=true;assert.equal(nextDeadline(a,b,0),null);
});

const U='00000000-0000-4000-8000-000000000001',GID='00000000-0000-4000-8000-0000000000aa';
const handler=createHandler({
  allowedOrigins:['http://localhost:5173'],
  verifyToken:async t=>t==='good'?U:null,
  match:async(uid,target)=>{if(target==='00000000-0000-4000-8000-0000000000ff')throw new MoveError('gone');return{game:GID}},
  play:async(uid,game,body)=>({ver:2,now:0,view:{op:body.op}}),
  logError:()=>{},
});
const req=(body,{token='good',origin='http://localhost:5173',method='POST'}={})=>handler(new Request('https://x/',{method,headers:{Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})},body:method==='POST'?typeof body==='string'?body:JSON.stringify(body):undefined}));

test('HTTP: CORS only for allowed origins',async()=>{
  const r=await req(null,{method:'OPTIONS'});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'http://localhost:5173');
  const x=await req(null,{method:'OPTIONS',origin:'https://evil.example'});assert.equal(x.headers.get('access-control-allow-origin'),null);
});
test('HTTP: no token or a bad token is 401',async()=>{
  assert.equal((await req({op:'match',target:U},{token:null})).status,401);
  assert.equal((await req({op:'match',target:U},{token:'bad'})).status,401);
});
test('HTTP: routing and validation',async()=>{
  assert.equal((await req('{nope')).status,422);
  assert.equal((await req({op:'what'})).status,422);
  assert.equal((await req({op:'match',target:U})).status,422,'cannot match yourself');
  assert.deepEqual(await (await req({op:'match',target:'00000000-0000-4000-8000-000000000002'})).json(),{game:GID});
  const g=await req({op:'match',target:'00000000-0000-4000-8000-0000000000ff'});assert.equal(g.status,409);assert.deepEqual(await g.json(),{error:'gone'});
  assert.equal((await req({op:'act',game:'x'})).status,422);
  assert.deepEqual((await (await req({op:'resign',game:GID})).json()).view,{op:'resign'});
  assert.equal((await req({op:'act',game:GID},{method:'GET'})).status,405);
});

test('auth relay: first-party cookies, only Neon Auth cookies, only listed paths',()=>{
  assert.equal(firstPartyCookie('__Secure-neon-auth.session_token=abc; Domain=x.neon.tech; Path=/; HttpOnly; Secure; SameSite=None; Partitioned'),'__Secure-neon-auth.session_token=abc; Path=/; HttpOnly; Secure; SameSite=Lax');
  assert.equal(authCookies('a=1; __Secure-neon-auth.session_token=t; gp=2'),'__Secure-neon-auth.session_token=t');
  assert.ok(isProxiedPath('/get-session')&&!isProxiedPath('admin/list-users'));
});
