// Chromium tests with synthetic public-service responses; no Google credentials.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const BASE=process.env.TEST_SITE_URL||'http://127.0.0.1:8765';
function table(headers,rows=[]){return {table:{cols:headers.map(label=>({label})),rows:rows.map(row=>({c:row.map(value=>({v:value,f:String(value)}))}))}}}
function dataFor(dataset){
  if(dataset==='main')return {tables:{
    DATA:table(['TYPE','SECTION','LOCATION','NUMBER','START','END','DESCRIPTION','URL','VEC_NO','VEC_START','VEC_END','VEC_DESCRIPTION','VEC_URL']),
    EQUIPMENT:table(['PTW_NO','LOCATION','EQUIPMENT','EXPIRY_DATE']),
    BOOKMARKS:table(['SECTION','NAME','URL','ORDER'],[['MAIN SITE','PUBLIC RECORD <img src=x onerror=alert(1)>','https://example.com','1']]),
  }};
  if(dataset==='summary')return {rows:[['NO','STEPS','PIG ARRANGEMENT / ACTIVITIES','PIG','START/LAUNCH','END/ARRIVAL'],['1','Step 1','PUBLIC RECORD','A','10/08/2026 12:00','11/08/2026 12:00']]};
  return {table:table(['DATE','TIME','LOCATION','READING'],[['10/08/2026','12:00','PUBLIC RECORD','-15']])};
}
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    for(const path of ['/','/SWABBING/','/SUMMARY/']){
      const context=await browser.newContext();
      const page=await context.newPage();
      const errors=[],violations=[],serviceCalls=[],unexpected=[];
      let failure=false;
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(/accounts\.google|sheets\.googleapis|docs\.google/.test(request.url()))unexpected.push(request.url())});
      await page.exposeFunction('recordViolation',event=>violations.push(event));
      await page.addInitScript(()=>{
        localStorage.setItem('krejuv-fec-sheet-data-v7','OLD PRIVATE CACHE');
        document.addEventListener('securitypolicyviolation',event=>window.recordViolation(event.effectiveDirective+':'+event.blockedURI));
      });
      await context.route('**/public-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.PUBLIC_REFERENCE_CONFIG={endpoint:"https://script.google.com/macros/s/test-deployment/exec"};'}));
      await context.route('https://i.ibb.co/**',route=>route.abort());
      await context.route('https://script.google.com/macros/s/test-deployment/exec?**',route=>{
        const url=new URL(route.request().url());
        serviceCalls.push(url);
        assert.equal(route.request().headers().authorization,undefined);
        const payload=failure?{ok:false,error:'Unavailable'}:{ok:true,data:dataFor(url.searchParams.get('dataset'))};
        return route.fulfill({contentType:'application/javascript',body:url.searchParams.get('callback')+'('+JSON.stringify(payload)+');'});
      });
      await context.route('https://script.googleusercontent.com/macros/echo?**',route=>{
        const params=new URL(route.request().url()).searchParams;
        const payload=failure?{ok:false,error:'Unavailable'}:{ok:true,data:dataFor(params.get('dataset'))};
        return route.fulfill({contentType:'application/javascript',body:params.get('callback')+'('+JSON.stringify(payload)+');'});
      });
      await page.goto(BASE+path);
      try {
        await page.waitForFunction(()=>document.getElementById('public-app').innerText.includes('PUBLIC RECORD'),null,{timeout:10000});
      } catch(error) {
        console.error({path,errors,violations,serviceCalls:serviceCalls.map(url=>url.href),status:await page.locator('#public-data-status').textContent()});
        throw error;
      }
      assert.equal(await page.locator('#public-app').isVisible(),true);
      assert.equal(await page.locator('#security-signin').count(),0);
      assert.equal(await page.locator('#public-data-status').isVisible(),false);
      assert.equal(await page.locator('img[src="x"]').count(),0);
      assert.deepEqual(errors,[]);
      assert.deepEqual(violations,[]);
      assert.deepEqual(unexpected,[]);
      assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
      assert.equal(serviceCalls.length,path==='/SWABBING/'?2:1,'Concurrent requests coalesced by dataset');
      assert.ok(serviceCalls.every(url=>Array.from(url.searchParams.keys()).sort().join(',')==='callback,dataset'));
      // Check the Google ContentService response host separately: Playwright
      // routes only the first URL of a browser redirect chain.
      assert.equal(await page.evaluate(()=>new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        const callback='__hafizPublicData_'+'a'.repeat(32);
        window[callback]=payload=>{script.remove();delete window[callback];resolve(payload.ok)};
        script.src='https://script.googleusercontent.com/macros/echo?dataset=main&callback='+callback;
        script.onerror=reject;
        document.head.appendChild(script);
      })),true);
      assert.deepEqual(violations,[]);
      failure=true;
      await page.reload();
      await page.locator('#public-data-status').waitFor({state:'visible'});
      assert.ok(!(await page.locator('#public-app').innerText()).includes('PUBLIC RECORD'));
      console.log(`PASS ${path}: anonymous records, JSONP/CSP hosts, read-only links, empty/error state, no Google login or direct workbook requests`);
      await context.close();
    }
    const page=await browser.newPage();
    await page.goto(BASE);
    await page.locator('#public-data-status').waitFor({state:'visible'});
    assert.equal(await page.locator('#security-signin').count(),0);
    console.log('PASS unconfigured service shows unavailable records without a login gate');
    const contents=['index.html','SWABBING/index.html','SUMMARY/index.html','public-config.js','public-data.js'].map(name=>fs.readFileSync(name,'utf8')).join('\n');
    assert.ok(!/docs\.google\.com\/spreadsheets\/d\//.test(contents));
    assert.ok(!/apps\.googleusercontent\.com/.test(contents));
    console.log('PASS frontend assets contain no direct spreadsheet URLs or OAuth client ID');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
