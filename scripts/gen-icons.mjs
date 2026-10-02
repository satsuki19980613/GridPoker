// PNG icons for the home screen from public/icon.svg: node scripts/gen-icons.mjs
// Rendering uses Playwright's Chromium (PLAYWRIGHT_MODULE: path to @playwright/test; default: the WWYD checkout next door).
import{readFileSync}from'node:fs';
import{resolve}from'node:path';
import{pathToFileURL}from'node:url';

const PUBLIC=resolve(import.meta.dirname,'../public');
const mod=process.env.PLAYWRIGHT_MODULE??resolve(import.meta.dirname,'../../WWYD/node_modules/@playwright/test/index.mjs');
const{chromium}=await import(pathToFileURL(mod).href);
const svg=readFileSync(resolve(PUBLIC,'icon.svg'),'utf8');
const browser=await chromium.launch();
try{
  for(const[file,size]of[['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]){
    const page=await browser.newPage({viewport:{width:size,height:size}});
    await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ',`<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({path:resolve(PUBLIC,file)});
    await page.close();console.log(`${file} (${size})`);
  }
}finally{await browser.close()}
