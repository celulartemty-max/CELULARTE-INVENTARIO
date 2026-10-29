import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('mobile form controls avoid iPhone focus zoom without disabling user zoom',()=>{
  const frame=read('app/frame-fix.css');
  assert.match(frame,/input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*select,\s*textarea\s*\{[^}]*font-size: 16px !important/s);
  assert.doesNotMatch(read('app/layout.tsx'),/userScalable:\s*false|maximumScale:\s*1|user-scalable=no/);
});
test('product mobile layout has compact heading and rows but touch-sized controls',()=>{
  const css=read('app/(app)/productos/products.css');
  assert.match(css,/@media\(max-width:800px\)/);
  assert.match(css,/header\.productPageHeader h1\{font-size:26px!important/);
  assert.match(css,/productListActions button\{min-height:44px/);
  assert.match(css,/productName\{[^}]*overflow-wrap:anywhere/);
});
