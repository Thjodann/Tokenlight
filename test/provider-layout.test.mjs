import test from 'node:test';
import assert from 'node:assert/strict';
import { providerLayout } from '../src/provider-layout.mjs';
import { providerPanel } from '../src/provider-panel.mjs';
import { demoCards } from '../src/fixtures.mjs';
test('short windows use a glance before full instruments can fit', () => {
  for (const [w,h,expected] of [[260,180,'micro'],[440,240,'micro'],[599,220,'micro'],[600,220,'strip'],[601,220,'strip'],[1200,180,'strip'],[1600,240,'strip'],[440,320,'micro'],[440,321,'micro'],[440,440,'micro'],[440,441,'stacked'],[559,400,'micro'],[560,400,'square']]) assert.equal(providerLayout(w,h),expected,`${w}x${h}`);
});
test('sidebar, intermediate, panorama and roomy regimes follow actual geometry', () => {
  for (const [w,h,expected] of [[359,600,'sidebar'],[360,600,'stacked'],[260,599,'stacked'],[260,600,'sidebar'],[559,500,'stacked'],[560,500,'square'],[640,560,'square'],[700,500,'wide-short'],[700,600,'square'],[999,800,'square'],[1000,800,'roomy'],[1200,699,'square'],[1200,700,'roomy'],[1919,800,'roomy'],[1920,800,'wide-short'],[1921,800,'wide-short']]) assert.equal(providerLayout(w,h),expected,`${w}x${h}`);
  for(const args of [[0,0],[NaN,180],[260,-1]])assert.equal(providerLayout(...args),'stacked');
});
test('small summaries retain source separation and offer explicit drill-downs', () => {
  const snapshot={month:'2026-11',cards:demoCards('2026-11'),settings:{showRemainingAllowance:true,accountProfiles:{}}};
  const html=providerPanel(snapshot,'anthropic','strip',{}, {width:900,height:220});
  assert.equal((html.match(/class="provider-lane"/g)||[]).length,2);
  assert.equal((html.match(/data-provider-detail=/g)||[]).length,2);
  assert.match(html,/data-density="micro"/);assert.match(html,/Resets /);
  assert.doesNotMatch(html,/data-source="cursor"|data-source="openai"|<details/);
});
