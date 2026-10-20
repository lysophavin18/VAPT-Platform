const { chromium } = require('../noovastack-vapt/frontend/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
async function main() {
  const browser = await chromium.launch({headless:true, executablePath:'/home/sophavin/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args:['--no-sandbox']});
  const context = await browser.newContext({viewport:{width:1440,height:900}, colorScheme:'light', recordVideo:{dir:path.join(__dirname,'recordings'),size:{width:1440,height:900}}});
  await context.addInitScript(() => localStorage.setItem('noovastack.theme','light'));
  const page = await context.newPage();
  const errors=[];
  page.on('response',r=>{if(r.status()>=400 && r.url().includes('/api/'))errors.push({url:new URL(r.url()).pathname,status:r.status()});});
  await page.goto('http://127.0.0.1:3000/login');
  const env = fs.readFileSync(path.join(root,'noovastack-vapt/.env'),'utf8');
  const match=env.match(/^INITIAL_ADMIN_PASSWORD=(.*)$/m);
  if(!match) throw Error('Local login credentials unavailable');
  const password=match[1].trim().replace(/^['"]|['"]$/g,'');
  await page.getByLabel('Email',{exact:true}).fill('admin@noovastack.local');
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await page.waitForURL('**/dashboard',{timeout:20000});
  console.log('Authenticated through actual login page');
  const chapters=[];
  const start=Date.now();
  for(const [route,label] of [['/dashboard','Dashboard'],['/projects','Projects'],['/assets','Assets'],['/scans','Scans'],['/findings','Findings'],['/approvals','Approvals'],['/schedules','Schedules'],['/ai-agents','AI assistant'],['/reports','Reports']]){
    await page.goto('http://127.0.0.1:3000'+route,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(3500);
    chapters.push({label,route,seconds:Math.round((Date.now()-start)/1000),title:await page.title(),errors:errors.splice(0)});
    await page.screenshot({path:path.join(__dirname,`tour-${label.replaceAll(' ','-')}.png`)});
    console.log('Viewed '+label+' '+page.url());
    await page.waitForTimeout(3500);
    await page.mouse.move(1100,650);
    await page.mouse.wheel(0,450);
    await page.waitForTimeout(2500);
  }
  await page.goto('http://127.0.0.1:3000/dashboard');
  await page.waitForTimeout(3000);
  const video=page.video();
  await context.close();
  await video.saveAs(path.join(__dirname,'NoovaStack-Localhost-Tour.webm'));
  fs.writeFileSync(path.join(__dirname,'tour-checks.json'),JSON.stringify(chapters,null,2));
  await browser.close();
}
main().catch(e=>{console.error(e.message);process.exit(1)});
