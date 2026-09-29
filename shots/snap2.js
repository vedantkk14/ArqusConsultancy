const p=require('puppeteer-core');
(async()=>{
const b=await p.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:'D:/arqus_consultancy/shots/chrome-a'});
const pg=await b.newPage(); await pg.setViewport({width:1440,height:900});
await pg.goto('http://localhost:4300/leads/70',{waitUntil:'domcontentloaded',timeout:60000});
await new Promise(r=>setTimeout(r,3000));
// click New project
const btns = await pg.$$('button');
for (const btn of btns) {
  const t = await pg.evaluate(el=>el.textContent, btn);
  if (t.includes('New project')) { await btn.click(); break; }
}
await new Promise(r=>setTimeout(r,1200));
await pg.screenshot({path:'D:/arqus_consultancy/shots/_new_deal_dialog.png'});
await b.close();
})();
