const p=require('puppeteer-core');
(async()=>{
const b=await p.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:'D:/arqus_consultancy/shots/chrome-c'});
const pg=await b.newPage(); await pg.setViewport({width:1440,height:900});
await pg.goto('http://localhost:4300/login',{waitUntil:'domcontentloaded',timeout:60000});
await pg.waitForSelector('input[type=password]',{timeout:60000});
const inputs = await pg.$$('input');
await inputs[0].type(process.env.U||'admin'); await inputs[1].type(process.env.P||'admin@123');
await pg.keyboard.press('Enter');
await new Promise(r=>setTimeout(r,3000));
for (const u of process.argv.slice(2)) {
  await pg.goto('http://localhost:4300'+u,{waitUntil:'domcontentloaded',timeout:60000});
  await new Promise(r=>setTimeout(r,3500));
  await pg.screenshot({path:'D:/arqus_consultancy/shots/'+(u.replace(/\W+/g,'_')||'root')+'.png', fullPage:true});
}
await b.close();
})();
