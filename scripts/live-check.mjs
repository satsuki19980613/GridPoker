// Live check against production (GitHub Actions "Live", .github/workflows/live.yml). Read-only: nothing is written.
//   the site, the /api/auth relay, the Function "game" and the Data API answer without signing in, and refuse what they should;
//   Mozilla HTTP Observatory grades the site's protective headers.
// env: SITE, AUTH_URL, DATA_URL, GAME_URL (production values: .env.production)
import{appendFileSync}from'node:fs';

const env=n=>{const v=process.env[n];if(!v){console.error(`環境変数 ${n} が必要です`);process.exit(2)}return v.replace(/\/+$/,'')};
const SITE=env('SITE'),DATA=env('DATA_URL'),GAME=env('GAME_URL')+'/';env('AUTH_URL');
const FAKE_JWT='Bearer eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ4In0.AAAA';
const results=[],lat={};let failed=0;
function check(name,ok,detail=''){
  results.push({name,ok,detail});if(!ok)failed++;
  console.log(`${ok?'ok  ':'NG  '} ${name}${detail?` — ${detail}`:''}`);
}
async function timed(label,url,init={}){
  const t=performance.now();
  let r,body;
  try{r=await fetch(url,{redirect:'manual',...init});body=await r.text()}
  catch(e){(lat[label]??=[]).push(performance.now()-t);return{status:0,headers:new Headers(),body:String(e.cause??e),json:null}}
  (lat[label]??=[]).push(performance.now()-t);
  let json=null;try{json=JSON.parse(body)}catch{/* not json */}
  return{status:r.status,headers:r.headers,body,json};
}
function summary(title){
  const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))]};
  const lines=[`### ${title}`,'',`${results.length-failed} / ${results.length} 件 OK`,'','| 確認 | 結果 | 詳細 |','|---|---|---|',
    ...results.map(r=>`| ${r.name} | ${r.ok?'OK':'**NG**'} | ${String(r.detail).replace(/[\\|]/g,'\\$&').slice(0,200)} |`),
    '','| 通信 | 回数 | 中央値 ms | 95% ms | 最大 ms |','|---|---|---|---|---|',
    ...Object.entries(lat).map(([k,a])=>`| ${k} | ${a.length} | ${pct(a,.5).toFixed(0)} | ${pct(a,.95).toFixed(0)} | ${Math.max(...a).toFixed(0)} |`),''];
  console.log(lines.join('\n'));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
}

/* ---------- the site ---------- */
const top=await timed('site',SITE+'/');
check('サイト / が 200',top.status===200,`${top.status}`);
const h=n=>top.headers.get(n)||'';
const csp=h('content-security-policy');
check('CSP: スクリプトはこのサイトのものだけ',/(^|;)\s*script-src 'self'\s*(;|$)/.test(csp)&&/default-src 'self'/.test(csp),csp.slice(0,120));
check('CSP: ほかのサイトの枠に入れない・プラグインを読まない',/frame-ancestors 'none'/.test(csp)&&/object-src 'none'/.test(csp));
check('CSP: 本番の Data API と Function への通信を許す',csp.includes(new URL(DATA).origin)&&csp.includes(new URL(GAME).origin));
check('HSTS（6 か月以上）',+(/max-age=(\d+)/.exec(h('strict-transport-security'))?.[1]??0)>=15552000,h('strict-transport-security'));
check('X-Content-Type-Options: nosniff',h('x-content-type-options')==='nosniff');
check('Referrer-Policy',/strict-origin|no-referrer|same-origin/.test(h('referrer-policy')),h('referrer-policy'));
const assets=[...top.body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m=>m[1]);
check('ビルドした JS / CSS が index.html にある',assets.length>=2,assets.join(' '));
for(const a of assets){const r=await timed('site',SITE+a);check(`${a} が 200`,r.status===200,`${r.status} ${r.headers.get('content-type')}`)}
const js=assets.find(a=>a.endsWith('.js'));
if(js){const r=await timed('site',SITE+js);check('JS に本番の Data API / Function の URL が入っている',r.body.includes(DATA)&&r.body.includes(GAME.replace(/\/$/,'')))}
for(const p of['/manifest.webmanifest','/sw.js','/theme.js','/icon.svg']){const r=await timed('site',SITE+p);check(`${p} が 200`,r.status===200,`${r.status}`)}

/* ---------- sign-in relay (/api/auth) ---------- */
const ok=await timed('auth relay',SITE+'/api/auth/ok');
check('ログイン中継 /api/auth/ok が 200',ok.status===200,`${ok.status} ${ok.body.slice(0,80)}`);
const sess=await timed('auth relay',SITE+'/api/auth/get-session');
check('未ログインの get-session が 200・利用者なし',sess.status===200&&!(sess.json&&sess.json.user),`${sess.status} ${sess.body.slice(0,80)}`);
const tok=await timed('auth relay',SITE+'/api/auth/token');
check('未ログインの token が 401',tok.status===401,`${tok.status} ${tok.body.slice(0,80)}`);
const so=await timed('auth relay',SITE+'/api/auth/sign-in/social',{method:'POST',headers:{'Content-Type':'application/json',Origin:SITE},
  body:JSON.stringify({provider:'google',callbackURL:SITE+'/',errorCallbackURL:SITE+'/?error=login_failed',disableRedirect:true})});
// with Neon's shared OAuth app the sign-in goes through Neon Auth first, then to Google: follow it to Google's consent screen
let gurl=so.json&&so.json.url||'';const hops=[];
for(let i=0;i<4&&gurl&&!/^https:\/\/accounts\.google\.com\//.test(gurl);i++){
  hops.push(new URL(gurl).host);
  const r=await timed('auth relay',gurl);
  gurl=r.headers.get('location')?new URL(r.headers.get('location'),gurl).href:'';
}
check('Google ログインの開始が Google の同意画面に着く',so.status===200&&/^https:\/\/accounts\.google\.com\//.test(gurl),`${so.status} ${[...hops,gurl&&new URL(gurl).host].join(' → ')||so.body.slice(0,120)}`);
const sc=so.headers.getSetCookie();
check('ログイン開始の Cookie がこのサイトのもの（Domain 無し・Secure）',sc.length>0&&sc.every(c=>!/;\s*domain=/i.test(c)&&/;\s*secure/i.test(c)),sc.map(c=>c.split(';')[0].split('=')[0]).join(', '));
const nf=await timed('auth relay',SITE+'/api/auth/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
check('中継しないパス（sign-up/email）は 404',nf.status===404,`${nf.status}`);

/* ---------- Function "game": CORS and sign-in required ---------- */
const pre=await timed('function',GAME,{method:'OPTIONS',headers:{Origin:SITE,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
check('Function の preflight がサイトを許す',pre.status===204&&pre.headers.get('access-control-allow-origin')===SITE,`${pre.status} ${pre.headers.get('access-control-allow-origin')}`);
const evil=await timed('function',GAME,{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'POST'}});
check('Function の preflight がほかのサイトを許さない',!evil.headers.get('access-control-allow-origin'),`${evil.headers.get('access-control-allow-origin')}`);
const g0=await timed('function',GAME,{method:'POST',headers:{Origin:SITE,'Content-Type':'application/json'},body:'{"op":"resign"}'});
check('Function はトークン無しを 401 で断る',g0.status===401&&g0.headers.get('access-control-allow-origin')===SITE,`${g0.status} ${g0.body.slice(0,80)}`);
const g1=await timed('function',GAME,{method:'POST',headers:{Origin:SITE,'Content-Type':'application/json',Authorization:FAKE_JWT},body:'{"op":"resign"}'});
check('Function は偽のトークンを 401 で断る',g1.status===401,`${g1.status}`);

/* ---------- Data API: sign-in required, tables closed ---------- */
const dpre=await timed('data api',DATA+'/rpc/me',{method:'OPTIONS',headers:{Origin:SITE,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
const acao=dpre.headers.get('access-control-allow-origin');
check('Data API の preflight がサイトを許す',dpre.status<300&&(acao==='*'||acao===SITE),`${dpre.status} ${acao}`);
const d0=await timed('data api',DATA+'/rpc/me',{method:'POST',headers:{Origin:SITE,'Content-Type':'application/json'},body:'{}'});
check('Data API はトークン無しを断る（4xx）',d0.status>=400&&d0.status<500,`${d0.status} ${d0.body.slice(0,160)}`);
const d1=await timed('data api',DATA+'/rpc/me',{method:'POST',headers:{Origin:SITE,'Content-Type':'application/json',Authorization:FAKE_JWT},body:'{}'});
check('Data API は偽のトークンを断る（4xx）',d1.status>=400&&d1.status<500,`${d1.status} ${d1.body.slice(0,160)}`);
for(const t of['profiles','lobby','games']){
  const r=await timed('data api',`${DATA}/${t}?select=*&limit=1`,{headers:{Origin:SITE}});
  check(`Data API で表 ${t} を直接読めない`,r.status>=400,`${r.status} ${r.body.slice(0,100)}`);
}

/* ---------- Mozilla HTTP Observatory ---------- */
try{
  const host=new URL(SITE).host;
  const o=await timed('observatory',`https://observatory-api.mdn.mozilla.net/api/v2/scan?host=${encodeURIComponent(host)}`,{method:'POST'});
  const j=o.json||{};
  check('Mozilla HTTP Observatory が A+',o.status===200&&j.grade==='A+',
    j.error?`${o.status} ${j.error}`:`${j.grade} ${j.score} 点・${j.tests_passed} / ${j.tests_quantity} 項目合格・${j.scanned_at} ${j.details_url||''}`);
}catch(e){check('Mozilla HTTP Observatory が A+',false,String(e))}

summary('本番の通信確認');
process.exit(failed?1:0);
