const p=require('puppeteer-core');
(async()=>{
const b=await p.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:'D:/arqus_consultancy/shots/chrome-a'});
const pg=await b.newPage(); await pg.setViewport({width:1440,height:900});
await pg.goto('http://localhost:4300/login',{waitUntil:'domcontentloaded',timeout:60000});
await pg.waitForSelector('input[type=password]',{timeout:60000});
const inputs = await pg.$$('input');
await inputs[0].type(process.env.USER||'admin');
await inputs[1].type(process.env.PASS||'admin@123');
await pg.keyboard.press('Enter');
await new Promise(r=>setTimeout(r,3000));
const urls = process.argv.slice(2);
for (const u of urls) {
  await pg.goto('http://localhost:4300'+u,{waitUntil:'domcontentloaded',timeout:60000});
  await new Promise(r=>setTimeout(r,3500));
  const name = u.replace(/\W+/g,'_') || 'root';
  await pg.screenshot({path:'D:/arqus_consultancy/shots/'+name+'.png', fullPage:true});
}
await b.close();
})();
