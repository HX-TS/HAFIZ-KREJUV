const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('apps-script/Code.gs', 'utf8');
const ids = { MAIN_SHEET_ID:'private-main-id', SWABBING_SHEET_ID:'private-swabbing-id', DEW_SHEET_ID:'private-dew-id', SUMMARY_SHEET_ID:'private-summary-id' };
let calls = [];
let fail = false;
let empty = false;
const date = new Date('2026-08-10T04:00:00Z');
function sheet(name) {
  return {
    getName:()=>name, getSheetId:()=>0,
    getLastRow:()=>empty?0:5, getLastColumn:()=>30,
    getRange(row,column,height,width) {
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
    return {getSheetByName:sheet, getSheets:()=>[sheet('Records')], getSpreadsheetTimeZone:()=> 'Asia/Kuala_Lumpur'};
  }},
};
vm.createContext(context);
vm.runInContext(source,context);
assert.equal(typeof context.doPost,'undefined','No write endpoint');
for(const dataset of ['main','swabbing','dew','summary']){
  calls=[];
  const result=context.doGet({parameter:{dataset,spreadsheetId:'attacker-controlled-id',range:'PRIVATE!A:Z',action:'delete'}});
  assert.equal(result.mime,'json');
  const payload=JSON.parse(result.text);
  assert.equal(payload.ok,true);
  assert.ok(result.text.includes('Public record'));
  for(const id of Object.values(ids))assert.ok(!result.text.includes(id),'No source ID leak');
  assert.ok(calls.every(call=>Object.values(ids).includes(call.id)),'Only configured sources read');
  assert.equal(calls.length,1,'Only the configured workbook is opened');
  if(dataset!=='summary')assert.ok(result.text.includes('Date(2026,7,10,12,0,0)'),'Native dates preserve spreadsheet local time');
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
console.log('PASS native backend: fixed datasets, read-only endpoint, source-ID redaction, dates, empty sheets, callback validation, and private error handling');
