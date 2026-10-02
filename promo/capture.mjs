// Real screenshots of the app for the X post: plays VS CPU on the dev server and saves phone-size shots.
// npm run dev, then: node promo/capture.mjs   (Playwright from the WWYD checkout, like scripts/gen-icons.mjs)
import{resolve}from'node:path';
import{pathToFileURL}from'node:url';
const mod=process.env.PLAYWRIGHT_MODULE??resolve(import.meta.dirname,'../../WWYD/node_modules/@playwright/test/index.mjs');
const{chromium}=await import(pathToFileURL(mod).href);
const OUT=resolve(import.meta.dirname,'shots'),URL=process.env.APP_URL??'http://localhost:5173/';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch();
try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true,colorScheme:'dark'});
  await ctx.addInitScript(()=>{try{localStorage.setItem('gp-theme','dark')}catch{}});
  const page=await ctx.newPage();
  await page.goto(URL);await wait(1200);
  await page.click('#vsCpu');await wait(800);
  const got={};
  const shot=async(key,name)=>{await page.mouse.move(1,1);if(process.env.ONLY&&!process.env.ONLY.split(',').includes(key)){got[key]=true;return}await page.screenshot({path:resolve(OUT,name+'.png')});got[key]=true;console.log('saved',name)};
  const tap=async sel=>{try{await page.click(sel,{timeout:1500})}catch{}};
  for(let k=0;k<2500&&!got.over;k++){
    await wait(220);
    const s=await page.evaluate(()=>{
      const open=id=>document.querySelector(id).open,btn=a=>{const b=document.querySelector(`#action [data-act="${a}"]`);return b&&!b.disabled};
      return{over:open('#overDlg'),res:open('#resDlg'),resText:open('#resDlg')?document.querySelector('#resBody').textContent:'',raise:open('#raiseDlg'),
        open:btn('raiseOpen'),check:btn('check'),call:btn('call'),hand:document.querySelectorAll('.hcard:not(:disabled)').length,
        placed:document.querySelectorAll('#board .cell .card').length};
    });
    if(s.over){const multi=await page.evaluate(()=>/Board 1/.test(document.querySelector('#overBody').textContent));if(multi||process.env.ANY){await wait(2200);await shot('over','4-over')}break}
    if(s.res){
      if(!got.showdown&&/showdown/.test(s.resText)&&!/split/.test(s.resText)){await wait(2600);await shot('showdown','3-showdown')}
      if(!got.board&&/BOARD \d+ · END/.test(s.resText)){await wait(1200);await shot('board','4-board')}
      await tap('#resBody [data-act="ack"]');continue;
    }
    if(s.raise){continue}
    if(s.open||s.call||s.check){
      if(!got.betting&&s.placed>=12){await wait(900);await shot('betting','2-betting')}
      if(!got.bet&&s.open&&s.placed>=8){
        await page.click('#action [data-act="raiseOpen"]');await wait(600);
        await page.click('#raiseBody .quick button:last-child');await wait(400);await shot('bet','2-bet');
        await page.click('#raiseBody [data-close]');await wait(400);
      }
      const big=await page.evaluate(()=>{const b=document.querySelector('#action [data-act="call"] small');return b?parseInt(b.textContent):0});
      await tap(`#action [data-act="${s.check?'check':big>15?'fold':'call'}"]`);continue;
    }
    if(s.hand){
      // place: a random hand card on a random empty cell; take the placing shot once the board has some cards
      const n=s.hand,i=Math.floor(Math.random()*n);
      try{await page.locator('.hcard:not(:disabled)').nth(i).click({timeout:1500})}catch{continue}await wait(250);
      if(!got.place&&s.placed>=13){await wait(500);await shot('place','1-place')}
      const t=page.locator('#board .cell.target');const m=await t.count();
      if(m)try{await t.nth(Math.floor(Math.random()*m)).click({timeout:1500})}catch{}
    }
  }
  await page.goto(URL);await wait(1200);await page.click('#rulesBtn');await wait(500);
  await page.locator('.g-seg').nth(5).click();await wait(2700);await shot('guide','5-guide');
  console.log(got);
}finally{await browser.close()}
