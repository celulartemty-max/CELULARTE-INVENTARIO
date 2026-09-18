import test from 'node:test';import assert from 'node:assert/strict';
const canEdit=(role,status)=>status!=='CANCELLED'&&(status==='DRAFT'||role==='MASTER');const canPos=(status,at)=>status!=='DRAFT'&&status!=='CANCELLED'&&!at;const canCorrection=(status,at)=>status==='POS_CORRECTION_PENDING'&&Boolean(at);const validQty=q=>Number.isInteger(q)&&q>0;const canClose=boxes=>boxes.length>0&&boxes.every(b=>b.lines.length>0);
test('OPERATIVE and MANAGER cannot edit closed reception',()=>{for(const role of ['OPERATIVE','MANAGER'])assert.equal(canEdit(role,'CLOSED'),false)});
test('MASTER can correct closed but not cancelled reception',()=>{assert.equal(canEdit('MASTER','CLOSED'),true);assert.equal(canEdit('MASTER','CANCELLED'),false)});
test('POS is impossible before close and initial POS only once',()=>{assert.equal(canPos('DRAFT',null),false);assert.equal(canPos('CLOSED',null),true);assert.equal(canPos('POS_REGISTERED',new Date()),false)});
test('post-POS correction requires correction registration',()=>assert.equal(canCorrection('POS_CORRECTION_PENDING',new Date()),true));
test('zero, negative and fractional quantities are rejected',()=>{for(const q of [0,-1,1.5])assert.equal(validQty(q),false);assert.equal(validQty(1),true)});
test('close rejects an empty box and accepts all nonempty boxes',()=>{assert.equal(canClose([{lines:[1]},{lines:[]}]),false);assert.equal(canClose([{lines:[1]},{lines:[1]}]),true)});
test('same model in different boxes remains independent',()=>{const boxes=[{model:'IPHONE 15',qty:2},{model:'IPHONE 15',qty:3}];assert.deepEqual(boxes.map(b=>b.qty),[2,3])});
