import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
const dir=mkdtempSync('/tmp/club-browser-');
const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,DATABASE_URL:'',PORT:'3101',NODE_ENV:'production',COACH_PIN:'831709',DB_PATH:dir+'/test.sqlite'},stdio:'pipe'});
let logs='';server.stderr.on('data',d=>logs+=d);
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('Test server failed: '+c+' '+logs)));});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3101');await page.getByText('Александр Морозов').first().waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/club-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Я тренер'}).click();await page.getByLabel('PIN-код тренера').fill('999999');await page.getByRole('button',{name:'Войти в команду'}).click();await page.getByText('Неверный PIN-код').waitFor();
 await page.getByLabel('PIN-код тренера').fill('831709');await page.getByRole('button',{name:'Войти в команду'}).click();
 const name='Анна Тестовая';await page.getByLabel('Имя нового участника').fill(name);await page.getByRole('button',{name:'Добавить',exact:true}).click();await page.getByText(name,{exact:true}).waitFor();
 const dates=['2026-06-01','2026-06-03','2026-06-05','2026-06-07','2026-06-09'];
 for(let i=0;i<dates.length;i++){
  await page.getByLabel('Дата тренировки').fill(dates[i]);
  await page.getByRole('button',{name:i===3?'Пропуск':i===4?'Опоздал':'Вовремя',exact:true}).click();
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/mutate')),page.getByRole('button',{name:'Сохранить отметки'}).click()]);
  await expect(page.getByRole('button',{name:'Сохранить отметки'})).toBeDisabled();
 }
 await page.reload();await page.getByRole('button',{name:'Я тренер'}).click();await page.getByLabel('Дата тренировки').fill('2026-06-09');await expect(page.getByRole('button',{name:'Опоздал',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Вовремя',exact:true}).click();await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/mutate')),page.getByRole('button',{name:'Сохранить отметки'}).click()]);await expect(page.getByRole('button',{name:'Сохранить отметки'})).toBeDisabled();
 await page.getByRole('button',{name:'К рейтингу'}).click();const row=page.getByRole('row').filter({hasText:name});await row.getByText('100%',{exact:true}).waitFor();assert.equal(await row.locator('.streak b').textContent(),'4');assert.equal(await row.locator('.badge').count(),1);
 await page.getByRole('button',{name:'Я тренер'}).click();await page.getByRole('button',{name:`Изменить имя: ${name}`}).click();await page.getByRole('textbox',{name:'Имя участника',exact:true}).fill('Анна Изменённая');await page.getByRole('button',{name:'Сохранить',exact:true}).click();
 await page.getByRole('button',{name:'Удалить: Анна Изменённая'}).click();await page.getByRole('button',{name:'Удалить',exact:true}).click();await page.getByText('Ваша команда — на старте').waitFor();await page.getByRole('button',{name:'Выйти',exact:true}).click();
 const denied=await page.request.post('http://127.0.0.1:3101/api/mutate',{data:{action:'add',payload:{name:'Blocked'}}});assert.equal(denied.status(),401);assert.deepEqual(errors,[]);
 console.log('PASS: production server, mobile layout, PIN, attendance, correction, refresh persistence, badges, participant management, authorization.');
}finally{await browser.close();server.kill();await new Promise(r=>server.once('exit',r));rmSync(dir,{recursive:true,force:true});}
