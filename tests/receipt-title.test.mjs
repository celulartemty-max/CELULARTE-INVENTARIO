import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),m={exports:{}};
const code=ts.transpileModule(readFileSync(new URL('../lib/inventory/receipt-title.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext('(function(exports){'+code+'})',{Intl,Date})(m.exports);
test('receipt title uses arrival calendar weekday and total Cajas',()=>{
 assert.equal(m.exports.receiptTitle('2026-10-27',6),'MARTES - 6 Cajas');
 assert.equal(m.exports.receiptTitle('2026-10-25',43),'DOMINGO - 43 Cajas');
 assert.equal(m.exports.receiptTitle('2026-10-28T00:00:00.000Z',80),'MIÉRCOLES - 80 Cajas');
});
