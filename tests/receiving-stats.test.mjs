import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
test('receiving counters query sessions with branch scope, draft and explicit closed states',async()=>{
 const code=ts.transpileModule(readFileSync(new URL('../lib/inventory/receiving-stats.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const m={exports:{}},queries=[];
 vm.runInNewContext('(function(require,module,exports){'+code+'})',{})(n=>n==='server-only'?{}:n==='@/lib/db'?{sql:async(parts,...args)=>{queries.push({sql:parts.join('?'),args});return[{open:3,closed:2}]}}:require(n),m,m.exports);
 assert.equal((await m.exports.receivingStats([])).open,0);assert.equal(queries.length,0);
 const result=await m.exports.receivingStats(['trevino']);assert.equal(result.open,3);assert.equal(result.closed,2);
 assert.match(queries[0].sql,/FROM receiving_sessions/);assert.match(queries[0].sql,/status='DRAFT'/);assert.match(queries[0].sql,/30 days/);assert.match(queries[0].sql,/branch_id=ANY/);assert.equal(queries[0].args[0][0],'trevino');
 await m.exports.receivingStats(null);assert.equal(queries[1].args[0],null);
});
