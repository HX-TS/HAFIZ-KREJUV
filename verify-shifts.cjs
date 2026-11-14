const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const helpers=html.slice(html.indexOf('function getMalaysiaParts('),html.indexOf('function renderBookmarks('));
const api={};
vm.runInNewContext('const MALAYSIA_OFFSET_MS=8*60*60*1000;\n'+helpers+'\nObject.assign(api,{getShift,getNextShift,getPreviousShift,permitCoversFullExpiryShift,getLastFullyUsableShift,formatShiftLabel});',{api});
const date=text=>new Date(text+'+08:00');
const cases=[
 ['2026-11-14T07:59:59','NIGHT SHIFT','2026-11-13T20:00:00','2026-11-14T07:59:00'],
 ['2026-11-14T08:00:00','DAY SHIFT','2026-11-14T08:00:00','2026-11-14T19:59:00'],
 ['2026-11-14T19:59:59','DAY SHIFT','2026-11-14T08:00:00','2026-11-14T19:59:00'],
 ['2026-11-14T20:00:00','NIGHT SHIFT','2026-11-14T20:00:00','2026-11-15T07:59:00'],
 ['2026-11-15T00:00:00','NIGHT SHIFT','2026-11-14T20:00:00','2026-11-15T07:59:00'],
 ['2026-12-31T23:59:00','NIGHT SHIFT','2026-12-31T20:00:00','2027-01-01T07:59:00'],
 ['2026-03-01T07:00:00','NIGHT SHIFT','2026-02-28T20:00:00','2026-03-01T07:59:00'],
];
for(const [time,type,start,end] of cases){
 const shift=api.getShift(date(time));
 assert.equal(shift.type,type,time);
 assert.equal(shift.start.getTime(),date(start).getTime(),time+' start');
 assert.equal(shift.end.getTime(),date(end).getTime(),time+' end');
 assert.equal(api.getNextShift(shift).start.getTime(),shift.end.getTime()+60000,'Next shift has correct start');
 assert.equal(api.getPreviousShift(shift).end.getTime(),shift.start.getTime()-60000,'Previous shift has correct end');
}
for(const [expiry,valid,lastStart] of [
 ['2026-11-14T19:58:00',false,'2026-11-13T20:00:00'],
 ['2026-11-14T19:59:00',true,'2026-11-14T08:00:00'],
 ['2026-11-15T07:58:00',false,'2026-11-14T08:00:00'],
 ['2026-11-15T07:59:00',true,'2026-11-14T20:00:00'],
]){
 assert.equal(api.permitCoversFullExpiryShift(date(expiry)),valid,expiry);
 assert.equal(api.getLastFullyUsableShift(date(expiry)).start.getTime(),date(lastStart).getTime(),'Renewal warning shift: '+expiry);
}
assert.ok(api.formatShiftLabel(api.getShift(date('2026-11-14T10:00:00'))).includes('08:00 - 19:59'));
assert.ok(api.formatShiftLabel(api.getShift(date('2026-11-14T21:00:00'))).endsWith('07:59'));
console.log('PASS: shift boundaries, overnight/month/year rollover, full-shift expiry, renewal warning shifts, labels');
