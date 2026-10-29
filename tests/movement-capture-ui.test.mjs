import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('exit and transfer capture use separate product-only forms and return to list',()=>{
  for(const p of ['salidas/[id]/exit-editor.tsx','traspasos/[id]/transfer-editor.tsx']){
    const s=readFileSync(new URL('../app/(app)/'+p,import.meta.url),'utf8');
    assert.match(s,/useState\(lines.length===0\)/);assert.match(s,/if\(capture&&/);
    assert.match(s,/Cancelar y volver/);assert.match(s,/\+ Agregar producto/);
    assert.match(s,/setCapture\(false\)/);assert.match(s,/setCapture\(true\)/);
    assert.doesNotMatch(s,/colorId|colors\[0\]/);
  }
});
