const p=require('puppeteer-core');
(async()=>{
const b=await p.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',userDataDir:'D:/arqus_consultancy/shots/chrome-d'});
const pg=await b.newPage(); await pg.setViewport({width:1440,height:900});
await pg.goto('http://localhost:4300/login',{waitUntil:'domcontentloaded',timeout:60000});
await pg.waitForSelector('input[type=password]',{timeout:60000});
const inputs = await pg.$$('input'); await inputs[0].type('admin'); await inputs[1].type('admin@123');
await pg.keyboard.press('Enter'); await new Promise(r=>setTimeout(r,3000));
await pg.goto('http://localhost:4300/accounts/statement',{waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,4000));
await pg.click('input[type=search]'); await pg.type('input[type=search]','spec'); await new Promise(r=>setTimeout(r,2500));
await pg.screenshot({path:'D:/arqus_consultancy/shots/_statement.png'});
await b.close();
})();
