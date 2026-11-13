const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('apps-script/Code.gs', 'utf8');
const ids = { MAIN_SHEET_ID:'private-main-id', SWABBING_SHEET_ID:'private-swabbing-id', DEW_SHEET_ID:'private-dew-id', SUMMARY_SHEET_ID:'private-summary-id' };
let calls = [];
let fail = false;
let empty = false;
let setupLog = '';
let tabsRead = [];
const date = new Date('2026-08-10T04:00:00Z');
function sheet(name,gid=0) {
  return {
    getName:()=>name, getSheetId:()=>gid,
    getLastRow:()=>empty?0:5, getLastColumn:()=>30,
    getRange(row,column,height,width) {
      tabsRead.push({name,gid});
      assert.equal(row,1); assert.equal(column,1);
      assert.equal(height,5); assert.equal(width,26,'Only existing A:Z columns returned');
      return {
        getValues:()=>[['NAME','VALUE'],['Public record',12],['https://docs.google.com/spreadsheets/d/'+ids.MAIN_SHEET_ID+'/edit',ids.SUMMARY_SHEET_ID],['Time',date],['Zero',0]],
        getDisplayValues:()=>[['NAME','VALUE'],['Public record','12'],[ids.MAIN_SHEET_ID,ids.SUMMARY_SHEET_ID],['Time','10/08/2026 12:00'],['Zero','0']],
      };
    },
  };
}
const output = { text:'', mime:'', setMimeType(type) { this.mime=type; return this; } };
const context = {
  Logger:{log:text=>{setupLog=text;}},
  PropertiesService:{getScriptProperties:()=>({getProperties:()=>ids})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'}, computeDigest:()=>[1], base64EncodeWebSafe:()=> 'test-signature',
    formatDate(value,timeZone,format) {
      assert.equal(value,date); assert.equal(timeZone,'Asia/Kuala_Lumpur');
      assert.equal(format,'yyyy,M,d,H,m,s'); return '2026,8,10,12,0,0';
    }},
  CacheService:{getScriptCache:()=>({get:()=>null, put:()=>{}})},
  ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'javascript'},createTextOutput(text){return {...output,text}}},
  SpreadsheetApp:{openById(id){
    calls.push({id});
    if(fail)throw new Error('Private source '+ids.MAIN_SHEET_ID+' cannot be read');
    const definitions = id===ids.MAIN_SHEET_ID ? [['DATA',0],['EQUIPMENT',1427488436],['BOOKMARK',2120430435]]
      : id===ids.DEW_SHEET_ID ? [['Form responses 1',403978998],['Sheet1',1298516507]] : [['Sheet1',0]];
    const sheets=definitions.map(([name,gid])=>sheet(name,gid));
    return {getSheetByName:name=>sheets.find(item=>item.getName()===name)||null, getSheets:()=>sheets, getSpreadsheetTimeZone:()=> 'Asia/Kuala_Lumpur'};
  }},
};
vm.createContext(context);
vm.runInContext(source,context);
assert.equal(typeof context.doPost,'undefined','No write endpoint');
for(const dataset of ['main','swabbing','dew','summary']){
  calls=[];
  tabsRead=[];
  const result=context.doGet({parameter:{dataset,spreadsheetId:'attacker-controlled-id',range:'PRIVATE!A:Z',action:'delete'}});
  assert.equal(result.mime,'json');
  const payload=JSON.parse(result.text);
  assert.equal(payload.ok,true);
  assert.ok(result.text.includes('Public record'));
  for(const id of Object.values(ids))assert.ok(!result.text.includes(id),'No source ID leak');
  assert.ok(calls.every(call=>Object.values(ids).includes(call.id)),'Only configured sources read');
  assert.equal(calls.length,1,'Only the configured workbook is opened');
  if(dataset!=='summary')assert.ok(result.text.includes('Date(2026,7,10,12,0,0)'),'Native dates preserve spreadsheet local time');
  if(dataset==='main'){
    assert.ok(payload.data.tables.BOOKMARKS,'Physical BOOKMARK tab uses the public BOOKMARKS key');
    assert.equal(payload.data.tables.BOOKMARK,undefined);
    assert.deepEqual(tabsRead.map(tab=>tab.name),['DATA','EQUIPMENT','BOOKMARK']);
  }
  if(dataset==='dew')assert.deepEqual(tabsRead,[{name:'Form responses 1',gid:403978998}],'Owner-selected Dew Point tab is used');
}
empty=true;
const emptyResult=JSON.parse(context.doGet({parameter:{dataset:'swabbing'}}).text);
assert.equal(emptyResult.ok,true);
assert.equal(emptyResult.data.table.table.rows.length,0);
empty=false;
calls=[];
for(const dataset of ['__proto__','constructor','arbitrary']){
  assert.equal(JSON.parse(context.doGet({parameter:{dataset}}).text).ok,false);
}
assert.equal(calls.length,0,'Unknown datasets never read sheets');
const invalid=context.doGet({parameter:{dataset:'main',callback:'x);attack()//'}});
assert.equal(invalid.mime,'json');
assert.ok(!invalid.text.includes('attack'));
const callback='__hafizPublicData_'+'a'.repeat(32);
const valid=context.doGet({parameter:{dataset:'main',callback}});
assert.equal(valid.mime,'javascript');
assert.ok(valid.text.startsWith(callback+'('));
fail=true;
const failed=context.doGet({parameter:{dataset:'main'}});
assert.equal(JSON.parse(failed.text).ok,false);
assert.ok(!failed.text.includes('private-main-id'));
assert.ok(!failed.text.includes('cannot be read'));
fail=false;
const setup=context.checkSetup();
assert.ok(setup.every(item=>item.status==='ready'));
for(const id of Object.values(ids))assert.ok(!setupLog.includes(id),'Diagnostics omit source IDs');
console.log('PASS native backend: fixed datasets, read-only endpoint, source-ID redaction, dates, empty sheets, callback validation, and private error handling');
