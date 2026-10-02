// X images (1600×900, rendered at 2×) from promo/x-*.html: node promo/render.mjs [name-filter]
import{readdirSync,mkdirSync}from'node:fs';
import{resolve}from'node:path';
import{pathToFileURL}from'node:url';
const mod=process.env.PLAYWRIGHT_MODULE??resolve(import.meta.dirname,'../../WWYD/node_modules/@playwright/test/index.mjs');
const{chromium}=await import(pathToFileURL(mod).href);
const DIR=import.meta.dirname,OUT=resolve(DIR,'out');mkdirSync(OUT,{recursive:true});
const only=process.argv[2]||'';
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:2});
  for(const f of readdirSync(DIR).filter(f=>/^x-.*\.html$/.test(f)&&f.includes(only))){
    await page.goto(pathToFileURL(resolve(DIR,f)).href,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
    const over=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.right>1601||r.bottom>901)}).map(e=>e.className||e.tagName).slice(0,5));
    await page.screenshot({path:resolve(OUT,f.replace('.html','.png'))});
    console.log(f,over.length?'OVERFLOW '+over.join(','):'ok');
  }
}finally{await browser.close()}
