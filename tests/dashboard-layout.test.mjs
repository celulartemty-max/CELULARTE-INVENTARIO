import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url), ts = require('typescript');
test('dashboard starts with greeting and indicators without the extra receiving summary or its queries', async () => {
    const source = readFileSync(new URL('../app/(app)/dashboard/page.tsx', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const queries = [], mod = { exports: {} };
    const mocks = {
        '@/lib/inventory/receiving-stats': { receivingStats: async () => ({open:3,closed:2}) },
        './registration-notice': { default: () => null },
        './transfer-receipt-notice': { default: () => null },
        'next/link': { default: props => React.createElement('a', props, props.children) },
        '@/lib/auth/authorization': { requireUser: async () => ({ id: 'user', name: 'Alejandro', role: 'MASTER', primaryBranchId: null }), getAuthorizedBranchIds: async () => null },
        '@/lib/db': { sql: async parts => { queries.push(parts.join('?')); return []; } },
    };
    vm.runInNewContext('(function(require,module,exports){' + code + '})', { Intl, Date })(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
    const tree = await mod.exports.default();
    const firstSection = React.Children.toArray(tree.props.children).find(child => child?.type === 'section');
    assert.equal(firstSection.props.className, 'dashTop');
    const html = renderToStaticMarkup(tree);
    assert.match(html, /Hola, Alejandro/);
    assert.match(html, /\/entradas\/pedidos\?status=open/);
    assert.match(html, /\/entradas\/pedidos\?status=closed/);
    assert.ok(html.indexOf('dashGreeting') < html.indexOf('dashStatsV2'));
    assert.doesNotMatch(html, /Recepciones por pedido|Abrir panel y crear recepción/);
    assert.ok(queries.every(query => !query.includes('receiving_sessions')));
});
test('receiving workspace remains accessible from its own section', () => {
    const source = readFileSync(new URL('../app/(app)/entradas/page.tsx', import.meta.url), 'utf8');
    assert.match(source, /\/entradas\/pedidos/);
});
