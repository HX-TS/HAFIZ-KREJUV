const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('apps-script/Code.gs', 'utf8');
const ids = { MAIN_SHEET_ID:'private-main-id', SWABBING_SHEET_ID:'private-swabbing-id', DEW_SHEET_ID:'private-dew-id', SUMMARY_SHEET_ID:'private-summary-id' };
let calls = [];
let fail = false;
const output = { text:'', mime:'', setMimeType(type) { this.mime=type; return this; } };
const context = {
  PropertiesService:{getScriptProperties:()=>({getProperties:()=>ids})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'}, computeDigest:()=>[1], base64EncodeWebSafe:()=> 'test-signature'},
  CacheService:{getScriptCache:()=>({get:()=>null, put:()=>{}})},
  ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'javascript'},createTextOutput(text){return {...output,text}}},
  Sheets:{Spreadsheets:{get(id,options){
    calls.push({id,options});
    if(fail)throw new Error('Private source '+ids.MAIN_SHEET_ID+' cannot be read');
    if(!options.ranges)return {sheets:[{properties:{sheetId:0,title:'Records'}}]};
    return {sheets:options.ranges.map(range=>({properties:{title:range.split("'")[1]},data:[{rowData:[
      {values:[{formattedValue:'NAME'},{formattedValue:'VALUE'}]},
      {values:[{effectiveValue:{stringValue:'Public record'},formattedValue:'Public record'},{effectiveValue:{numberValue:12},formattedValue:'12'}]},
      {values:[{effectiveValue:{stringValue:'https://docs.google.com/spreadsheets/d/'+ids.MAIN_SHEET_ID+'/edit'},formattedValue:ids.SUMMARY_SHEET_ID}]},
    ]}]}))};
  }}},
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
  assert.ok(calls.every(call=>!call.options.ranges||call.options.ranges.every(range=>!range.includes('PRIVATE!'))),'Visitor range ignored');
}
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
console.log('PASS backend: fixed datasets, read-only endpoint, source-ID redaction, callback validation, and private error handling');
