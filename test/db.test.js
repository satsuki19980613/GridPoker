// Database (migrations): sign-in personal data is never kept. Needs TEST_DATABASE_URL: a local Postgres prepared with
// scripts/test-db-stub.sql and db/migrations/*.sql (CI does this, .github/workflows/ci.yml). Skipped without it.
import{test,after}from'node:test';
import assert from'node:assert/strict';
import pg from'pg';

const url=process.env.TEST_DATABASE_URL;
const pool=url?new pg.Pool({connectionString:url,max:2}):null;
after(()=>pool?.end());
const q=(sql,args)=>pool.query(sql,args).then(r=>r.rows);
const U='00000000-0000-4000-8000-0000000000c1',BEFORE='00000000-0000-4000-8000-0000000000b0';

test('rows stored before the migration are scrubbed',{skip:!url},async()=>{
  const[u]=await q('select email,name,image from neon_auth."user" where id=$1',[BEFORE]);
  assert.deepEqual(u,{email:BEFORE+'@gridpoker.invalid',name:'Player',image:null});
  const[a]=await q('select "accountId","idToken","accessToken","refreshToken" from neon_auth.account where "userId"=$1',[BEFORE]);
  assert.deepEqual(a,{accountId:'google-before',idToken:null,accessToken:null,refreshToken:null});
  const[s]=await q('select "ipAddress","userAgent" from neon_auth.session where "userId"=$1',[BEFORE]);
  assert.deepEqual(s,{ipAddress:null,userAgent:null});
});

test('sign-in writes keep no email, name, image, Google tokens, IP address or browser',{skip:!url},async()=>{
  await q('delete from neon_auth."user" where id=$1',[U]);
  try{
    await q(`insert into neon_auth."user"(id,email,name,image) values($1,'someone@example.com','Some One','https://example.com/p.png')`,[U]);
    await q(`insert into neon_auth.account("accountId","providerId","userId","idToken","accessToken","refreshToken") values('google-1','google',$1,'eyJ.id','ya29.a','1//r')`,[U]);
    await q(`insert into neon_auth.session("userId","ipAddress","userAgent") values($1,'198.51.100.7','Mozilla/5.0')`,[U]);
    // Neon Auth updates the rows on later sign-ins (new tokens, a changed Google profile)
    await q(`update neon_auth."user" set email='new@example.com',name='New Name',image='https://example.com/q.png' where id=$1`,[U]);
    await q(`update neon_auth.account set "idToken"='eyJ.id2',"accessToken"='ya29.b',"refreshToken"='1//s' where "userId"=$1`,[U]);
    await q(`update neon_auth.session set "ipAddress"='198.51.100.8',"userAgent"='Mozilla/6.0' where "userId"=$1`,[U]);
    const[u]=await q('select email,name,image from neon_auth."user" where id=$1',[U]);
    assert.deepEqual(u,{email:U+'@gridpoker.invalid',name:'Player',image:null});
    const[a]=await q('select "accountId","providerId","idToken","accessToken","refreshToken" from neon_auth.account where "userId"=$1',[U]);
    assert.deepEqual(a,{accountId:'google-1',providerId:'google',idToken:null,accessToken:null,refreshToken:null});
    const[s]=await q('select "ipAddress","userAgent" from neon_auth.session where "userId"=$1',[U]);
    assert.deepEqual(s,{ipAddress:null,userAgent:null});
    // the app still works for the user: me() creates the profile with a random nickname
    const c=await pool.connect();
    try{
      await c.query('begin');await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:U,role:'authenticated'})]);
      const{rows:[{me}]}=await c.query('select public.me() as me');await c.query('commit');
      assert.match(me.nickname,/^Player-[0-9A-F]{4}$/);
    }catch(e){await c.query('rollback');throw e}finally{c.release()}
  }finally{await q('delete from neon_auth."user" where id=$1',[U])}
});

test('players cannot call the scrub functions',{skip:!url},async()=>{
  const c=await pool.connect();
  try{
    await c.query('begin');await c.query('set local role authenticated');
    await assert.rejects(c.query('select public.auth_user_scrub()'),/permission denied|trigger functions can only be called as triggers/);
  }finally{await c.query('rollback');c.release()}
});
