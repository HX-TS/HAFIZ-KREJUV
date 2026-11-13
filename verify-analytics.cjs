const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE=process.env.TEST_SITE_URL||'http://127.0.0.1:8766';
const ID='G-5B6JH0FLJR';
const KEY='krejuv-fec-analytics-consent-v1';
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    for(const path of ['/','/SWABBING/','/SUMMARY/']){
      const context=await browser.newContext();
      const page=await context.newPage();
      const requests=[],violations=[],errors=[];
      await page.exposeFunction('recordViolation',item=>violations.push(item));
      await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>window.recordViolation(event.effectiveDirective+':'+event.blockedURI)));
      page.on('pageerror',error=>errors.push(error.message));
      await context.route('https://script.google.com/**',route=>{
        const params=new URL(route.request().url()).searchParams;
        return route.fulfill({contentType:'application/javascript',body:params.get('callback')+'('+JSON.stringify({ok:false,error:'Test fixture'})+');'});
      });
      await context.route('https://i.ibb.co/**',route=>route.abort());
      await context.route('https://www.googletagmanager.com/gtag/**',route=>{
        requests.push(route.request().url());
        return route.fulfill({contentType:'application/javascript',body:'window.__analyticsTagLoaded=true;'});
      });
      await page.goto(BASE+path+'?private_test=not-for-analytics#private-fragment');
      await page.locator('#analytics-preferences').waitFor({state:'visible'});
      assert.equal(requests.length,0,'No Google tag loaded before consent');
      assert.equal(await page.evaluate(()=>typeof window.gtag),'undefined');
      await page.locator('#analytics-decline').click();
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),'denied');
      await page.reload();
      assert.equal(requests.length,0,'Declining persists across reloads');
      assert.equal(await page.locator('#analytics-preferences').isVisible(),false);
      await page.locator('.analytics-settings').click();
      await page.locator('#analytics-allow').click();
      await page.waitForFunction(()=>window.__analyticsTagLoaded===true);
      assert.equal(requests.length,1);
      assert.equal(new URL(requests[0]).searchParams.get('id'),ID);
      const queue=await page.evaluate(()=>window.dataLayer.map(item=>Array.from(item)));
      const config=queue.find(item=>item[0]==='config');
      assert.equal(config[1],ID);
      assert.equal(config[2].allow_google_signals,false);
      assert.equal(config[2].allow_ad_personalization_signals,false);
      assert.equal(config[2].cookie_prefix,'krejuv_fec');
      assert.equal(config[2].cookie_path,'/HAFIZ-KREJUV/');
      const views=queue.filter(item=>item[0]==='event'&&item[1]==='page_view');
      assert.equal(views.length,1,'Exactly one explicit page view per page load');
      assert.equal(views[0][2].page_location,BASE+path);
      assert.ok(!JSON.stringify(queue).includes('private_test'));
      assert.ok(!JSON.stringify(queue).includes('private-fragment'));
      assert.ok(queue.filter(item=>item[0]==='consent').every(item=>item[2].ad_storage==='denied'&&item[2].ad_personalization==='denied'&&item[2].ad_user_data==='denied'));
      const previous=requests.length;
      await page.reload();
      await page.waitForFunction(()=>window.__analyticsTagLoaded===true);
      assert.equal(requests.length,previous+1,'Saved acceptance loads the tag on the next page');
      await page.locator('.analytics-settings').click();
      await Promise.all([page.waitForNavigation(),page.locator('#analytics-decline').click()]);
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),'denied');
      assert.equal(requests.length,previous+1,'Withdrawal reloads without the tag');
      assert.equal(await page.locator('#analytics-preferences').isVisible(),false);
      assert.deepEqual(violations,[]);
      assert.deepEqual(errors,[]);
      console.log('PASS '+path+': opt-in, private configuration, URL sanitization, persistent choice, withdrawal and CSP');
      await context.close();
    }
    const context=await browser.newContext();
    const page=await context.newPage();
    let googleRequests=0;
    await page.addInitScript(key=>{
      localStorage.setItem(key,'granted');
      Object.defineProperty(navigator,'globalPrivacyControl',{get:()=>true});
    },KEY);
    await context.route('https://www.googletagmanager.com/**',route=>{googleRequests++;return route.abort()});
    await context.route('https://script.google.com/**',route=>route.abort());
    await context.route('https://i.ibb.co/**',route=>route.abort());
    await page.goto(BASE);
    await page.locator('.analytics-settings').click();
    assert.equal(await page.locator('#analytics-allow').isDisabled(),true);
    assert.equal(googleRequests,0,'Browser privacy signals override saved acceptance');
    console.log('PASS browser privacy signal');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
