import test from 'node:test';import assert from 'node:assert/strict';
const canEdit=(role,status)=>status==='DRAFT'||role==='MASTER'; const canPos=(status,at)=>status!=='DRAFT'&&status!=='CANCELLED'&&!at;
test('operatives and managers cannot edit closed reception',()=>{for(const role of ['OPERATIVE','MANAGER'])assert.equal(canEdit(role,'CLOSED'),false)});
test('MASTER can correct closed reception',()=>assert.equal(canEdit('MASTER','CLOSED'),true));
test('POS is impossible before close',()=>assert.equal(canPos('DRAFT',null),false));
test('POS is available after close only once',()=>{assert.equal(canPos('CLOSED',null),true);assert.equal(canPos('CLOSED',new Date()),false)});
