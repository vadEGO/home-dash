const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../web/core.js');
test('family clocks handle Sydney and European daylight saving independently',()=>{
 const date=new Date('2026-09-29T08:00:00Z');
 assert.equal(C.clock(date,C.zone),'18:00');assert.equal(C.clock(date,'Europe/London'),'09:00');assert.equal(C.clock(date,'Europe/Paris'),'10:00');assert.equal(C.clock(date,'Europe/Minsk'),'11:00');
 const winter=new Date('2026-12-01T08:00:00Z');assert.equal(C.clock(winter,C.zone),'19:00');assert.equal(C.clock(winter,'Europe/London'),'08:00');assert.equal(C.clock(winter,'Europe/Paris'),'09:00');assert.equal(C.clock(winter,'Europe/Minsk'),'11:00');
});
test('family date difference crosses year boundary',()=>{assert.equal(C.dayOffset(new Date('2026-12-31T14:00:00Z'),'Europe/London'),-1);});
test('Sydney theme has plausible sunrise sunset and respects manual selection',()=>{const day=new Date('2026-09-29T02:00:00Z');const s=C.sunTimes(day);assert.ok(s.rise>320&&s.rise<370);assert.ok(s.set>1050&&s.set<1110);assert.equal(C.theme('auto',day),'light');assert.equal(C.theme('auto',new Date('2026-09-29T14:00:00Z')),'dark');assert.equal(C.theme('dark',day),'dark');});
test('charts handle constant data and reject missing data',()=>{assert.ok(!C.sparkline([2,2,2]).includes('NaN'));assert.equal(C.sparkline([1,NaN]),'');assert.equal(C.sparkline([]),'');});
test('export time alone is not a research change',()=>{const a={score:89,bias:'LONG',rationale:'a',rank:1,updated:'yesterday'};assert.equal(C.meaningfulChange(a,{...a,updated:'today'}),false);assert.equal(C.meaningfulChange(a,{...a,score:90}),true);});
