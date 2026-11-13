// Real-data browser checks for the shared desktop/mobile theme and navigation.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE=process.env.TEST_SITE_URL||'http://127.0.0.1:8765';
const mainNames=['XPRESS PETRONAS','ACE PETRONAS','EPTW','LOCATION'];
const historyNames=['CLEANING','WATER FILLING CALC','HYDROTEST','DEWATERING','SWABBING'];
const ready={
  '/':()=>document.getElementById('syncText').textContent.includes('SYNCED'),
  '/SWABBING/':()=>document.querySelector('#swabbingContainer table')&&document.querySelector('#dewPointContainer table'),
  '/SUMMARY/':()=>document.getElementById('syncLabel').textContent==='Live Sheet Connected',
};
(async()=>{
  const proxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox'],...(proxy?{proxy:{server:proxy,bypass:'127.0.0.1,localhost'}}:{})});
  try{
    const context=await browser.newContext();
    for(const viewport of [{width:1440,height:1050},{width:390,height:844}]){
      for(const path of Object.keys(ready)){
        const page=await context.newPage();
        await page.setViewportSize(viewport);
        const errors=[],violations=[],unexpected=[];
        page.on('pageerror',error=>errors.push(error.message));
        page.on('request',request=>{if(/accounts\.google|sheets\.googleapis|docs\.google\.com\/spreadsheets/.test(request.url()))unexpected.push(request.url())});
        await page.exposeFunction('reportViolation',item=>violations.push(item));
        await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>window.reportViolation(event.effectiveDirective+':'+event.blockedURI)));
        await page.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForFunction(ready[path],null,{timeout:45000});
        await page.waitForFunction(()=>document.querySelectorAll('#historical-event-links .site-menu-link').length===5,null,{timeout:30000});
        await page.evaluate(()=>document.fonts.ready);
        assert.deepEqual(await page.locator('#main-site-links .site-menu-link').allTextContents(),mainNames);
        assert.deepEqual(await page.locator('#historical-event-links .site-menu-link').allTextContents(),historyNames);
        assert.equal(await page.locator('#historical-event-links [aria-disabled=true]').count(),2,'Existing empty bookmark URLs stay disabled');
        assert.equal(await page.locator('.site-hero__image').evaluate(image=>image.complete&&image.naturalWidth>0),true,'Header image loaded');
        assert.equal(await page.evaluate(()=>document.fonts.check('700 24px "Barlow Condensed"')),true,'Self-hosted heading font loaded');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'No page-wide horizontal overflow');
        assert.equal(await page.locator('#security-signin').count(),0);
        if(viewport.width<700){
          assert.equal(await page.locator('.site-nav').isVisible(),false);
          await page.locator('#site-menu-toggle').click();
          assert.equal(await page.locator('.site-nav').isVisible(),true);
        }
        const main=page.getByRole('button',{name:'MAIN SITE',exact:true});
        const historical=page.getByRole('button',{name:'HISTORICAL EVENT',exact:true});
        await main.click();
        assert.equal(await page.locator('#main-site-links').isVisible(),true);
        await historical.click();
        assert.equal(await page.locator('#main-site-links').isVisible(),false);
        assert.equal(await page.locator('#historical-event-links').isVisible(),true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#historical-event-links').isVisible(),false);
        await main.focus(); await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'XPRESS PETRONAS');
        await page.keyboard.press('Escape');
        if(viewport.width<700)await page.locator('#site-menu-toggle').click();
        if(path==='/'){
          assert.equal(await page.locator('.eptw-section-title').textContent().then(text=>text.trim()),'EPTW PERMIT CONTROL');
          assert.equal(await page.locator('#mainSiteColumn').count(),0,'Large bookmark column replaced by header menus');
          assert.ok(await page.locator('.ptw-data-row').count()>0);
          const toggle=page.locator('.section-toggle').first();
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'),'true','Permit section still expands');
          assert.equal(await page.locator('.ptw-data-row:visible').count()>0,true);
          if(viewport.width<700){
            const region=page.locator('.eptw-table-container');
            await region.evaluate(element=>element.scrollLeft=300);
            assert.ok(await region.evaluate(element=>element.scrollLeft)>0,'Every permit column remains horizontally reachable');
            await region.evaluate(element=>element.scrollLeft=0);
          }
        }
        if(path==='/SWABBING/')assert.ok(await page.locator('.swabbing-chart,.dew-chart').count()>=2);
        if(path==='/SUMMARY/'){
          const before=Number(await page.locator('#activityCount').textContent());
          await page.locator('#searchInput').fill('a-nonexistent-activity');
          assert.equal(await page.locator('#activityCount').textContent(),'0','Timeline search still filters records');
          await page.locator('#searchInput').fill('');
          assert.equal(Number(await page.locator('#activityCount').textContent()),before);
        }
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:'/workspace/theme-'+(path==='/'?'overview':path.replaceAll('/','').toLowerCase())+'-'+viewport.width+'.png',fullPage:false});
        assert.deepEqual(errors,[]);
        assert.deepEqual(violations,[]);
        assert.deepEqual(unexpected,[]);
        console.log(JSON.stringify({page:path,viewport:viewport.width,realDataLoaded:true,menusAndKeyboard:true,noHorizontalOverflow:true,scriptErrors:errors,cspViolations:violations}));
        await page.close();
      }
    }
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
