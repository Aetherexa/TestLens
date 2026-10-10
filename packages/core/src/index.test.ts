import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseUnifiedDiff,parseLcov,parseIstanbul,analyzeGaps,detectFramework,suggestRelatedTests,mapTestDependencies} from './index.ts';
test('diff identifies target-side added lines across hunks',()=>{
 const d='diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n context\n+added\n old\n@@ -8,1 +9,2 @@\n+new\n context';
 assert.deepEqual(parseUnifiedDiff(d),[{path:'src/a.ts',lines:[2,9]}]);
});
test('diff excludes deleted-only paths',()=>assert.deepEqual(parseUnifiedDiff('--- a/a.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old'),[]));
test('lcov preserves zero hit and branch evidence',()=>{const c=parseLcov('SF:src/a.ts\nDA:2,0\nBRDA:2,0,0,0\nBRDA:2,0,1,2\nend_of_record')[0];assert.equal(c.lines.get(2),0);assert.equal(c.branches[0].hits,0);});
test('coverage reports changed uncovered lines and branches',()=>{
 const found=analyzeGaps([{path:'src/a.ts',lines:[2]}],parseLcov('SF:/repo/src/a.ts\nDA:2,0\nBRDA:2,0,0,0\nend_of_record'));
 assert.deepEqual(found.map(x=>x.kind),['uncovered-change','uncovered-branch']);assert.ok(found.every(x=>x.evidence==='verified'));
});
test('does not label absence of coverage as a confirmed missing test',()=>{const found=analyzeGaps([{path:'a.ts',lines:[1]}],[]);assert.equal(found[0].evidence,'unknown');});
test('does not call uncovered uninstrumented line uncovered',()=>assert.equal(analyzeGaps([{path:'a.ts',lines:[9]}],parseLcov('SF:a.ts\nDA:2,0\nend_of_record')).length,0));
test('istanbul maps statements and branches',()=>{const c=parseIstanbul({'src/a.ts':{statementMap:{'0':{start:{line:4}}},s:{'0':0},branchMap:{'0':{line:4}},b:{'0':[0,1]}}})[0];assert.equal(c.lines.get(4),0);assert.equal(c.branches.length,2);});
test('vitest and jest discovery and unknown fallback',()=>{assert.equal(detectFramework({devDependencies:{vitest:'1'}}),'vitest');assert.equal(detectFramework({scripts:{test:'jest'}}),'jest');assert.equal(detectFramework({}),'unknown');});
test('suggested matching tests are potentials, not proof',()=>{const list=suggestRelatedTests(['src/price.ts'],['test/price.test.ts','test/cart.test.ts']);assert.equal(list.length,1);assert.equal(list[0].evidence,'potential');});
test('windows coverage paths match workspace files',()=>assert.equal(analyzeGaps([{path:'src/a.ts',lines:[1]}],parseLcov('SF:C:\\repo\\src\\a.ts\nDA:1,0\nend_of_record')).length,1));
test('static imports identify related tests even when test filename differs',()=>{
 const related=mapTestDependencies(['src/price.ts'],{'tests/order.test.ts':"import {price} from '../src/price';",'src/price.ts':'export const price=1'},['tests/order.test.ts']);
 assert.equal(related.length,1);assert.equal(related[0].method,'direct-import');
});
test('transitive imports identify affected tests',()=>{
 const related=mapTestDependencies(['src/price.ts'],{'tests/order.test.ts':"import '../src/cart';",'src/cart.ts':"export * from './price';",'src/price.ts':'export const price=1'},['tests/order.test.ts']);
 assert.equal(related[0].method,'transitive-import');
});
test('cycles in dependency graph terminate safely',()=>{
 const related=mapTestDependencies(['src/missing.ts'],{'tests/order.test.ts':"import '../src/cart';",'src/cart.ts':"import './other';",'src/other.ts':"import './cart';"},['tests/order.test.ts']);
 assert.equal(related.length,0);
});
test('does not mistake external package imports for source dependencies',()=>{
 const related=mapTestDependencies(['src/react.ts'],{'tests/order.test.ts':"import React from 'react';"},['tests/order.test.ts']);
 assert.equal(related.length,0);
});
test('ambiguous coverage paths are unknown, not verified',()=>{
 const found=analyzeGaps([{path:'src/a.ts',lines:[1]}],parseLcov('SF:/repo1/src/a.ts\nDA:1,0\nend_of_record\nSF:/repo2/src/a.ts\nDA:1,0\nend_of_record'));
 assert.equal(found[0].evidence,'unknown');
});
test('LCOV unknown branch hits are not misreported as confirmed uncovered',()=>{
 const found=analyzeGaps([{path:'src/a.ts',lines:[2]}],parseLcov('SF:src/a.ts\nBRDA:2,0,0,-\nend_of_record'));
 assert.equal(found.length,0);
});