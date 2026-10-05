// X images rendered at 2× from promo/x-*.html (landscape 1600×900) and promo/v-*.html and promo/w-*.html (portrait 900×1200; w = white): node promo/render.mjs [name-filter]
import{readdirSync,mkdirSync}from'node:fs';
import{resolve}from'node:path';
import{pathToFileURL}from'node:url';
const mod=process.env.PLAYWRIGHT_MODULE??resolve(import.meta.dirname,'../../WWYD/node_modules/@playwright/test/index.mjs');
const{chromium}=await import(pathToFileURL(mod).href);
const DIR=import.meta.dirname,OUT=resolve(DIR,'out');mkdirSync(OUT,{recursive:true});
const only=process.argv[2]||'';
const browser=await chromium.launch();
try{
  for(const f of readdirSync(DIR).filter(f=>/^[xvw]-.*[.]html$/.test(f)&&f.includes(only))){
    const[W,H]=/^[vw]-/.test(f)?[900,1200]:[1600,900],page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:2});
    await page.goto(pathToFileURL(resolve(DIR,f)).href,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
    const over=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.right>innerWidth+1||r.bottom>innerHeight+1)}).map(e=>e.className||e.tagName).slice(0,5));
    await page.screenshot({path:resolve(OUT,f.replace('.html','.png'))});
    console.log(f,over.length?'OVERFLOW '+over.join(','):'ok');await page.close();
  }
}finally{await browser.close()}
