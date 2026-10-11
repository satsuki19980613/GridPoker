// Count sign-in personal data left in the database (read-only): node scripts/auth-audit.mjs --branch <branch>
// Fails when any row still holds it, or when a scrub trigger (db/migrations/20261011000000_auth_scrub.sql) is missing.
// Also prints the neon_auth tables and column names (never values), to notice when Neon adds a column.
import{appendFileSync}from'node:fs';
import pg from'pg';
import{branchArg,connectionString}from'./neon.mjs';

const branch=branchArg();
const client=new pg.Client({connectionString:await connectionString(branch)});
await client.connect();
let failed=0;
const lines=[`### サインインの個人の情報（${branch}）`,'','| 確認 | 結果 | 件数 |','|---|---|---|'];
function check(name,ok,n){if(!ok)failed++;lines.push(`| ${name} | ${ok?'OK':'**NG**'} | ${n} |`);console.log(`${ok?'ok  ':'NG  '} ${name} — ${n}`)}
try{
  const{rows:[n]}=await client.query(`select
    (select count(*) from neon_auth."user")::int users,
    (select count(*) from neon_auth."user" where email <> id::text || '@gridpoker.invalid')::int email,
    (select count(*) from neon_auth."user" where name <> 'Player' or image is not null)::int profile,
    (select count(*) from neon_auth.account where "idToken" is not null or "accessToken" is not null or "refreshToken" is not null)::int tokens,
    (select count(*) from neon_auth.session where "ipAddress" is not null or "userAgent" is not null)::int sessions,
    (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where not t.tgisinternal and t.tgenabled <> 'D' and p.pronamespace = 'public'::regnamespace
        and (t.tgrelid::regclass::text, p.proname) in (('neon_auth."user"','auth_user_scrub'),('neon_auth.account','auth_account_scrub'),('neon_auth.session','auth_session_scrub')))::int triggers`);
  check('メールアドレスが残っている利用者',n.email===0,`${n.email} / ${n.users}`);
  check('表示名・画像が残っている利用者',n.profile===0,`${n.profile} / ${n.users}`);
  check('Google のトークンが残っているアカウント',n.tokens===0,n.tokens);
  check('IP アドレス・ブラウザの種類が残っているセッション',n.sessions===0,n.sessions);
  check('置き換えのトリガーが 3 つとも有効',n.triggers===3,n.triggers);
  const cols=await client.query(`select table_name t, string_agg(column_name, ', ' order by ordinal_position) c
    from information_schema.columns where table_schema = 'neon_auth' group by 1 order by 1`);
  lines.push('','| neon_auth の表 | 列 |','|---|---|',...cols.rows.map(r=>`| ${r.t} | ${r.c} |`),'');
  for(const r of cols.rows)console.log(`neon_auth.${r.t}: ${r.c}`);
}finally{await client.end()}
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
process.exit(failed?1:0);
