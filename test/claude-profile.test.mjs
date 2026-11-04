import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeProfile,readClaudeProfile} from '../src/claude-profile.mjs';
import {claudeConnectionSection} from '../src/credit-view.mjs';
const profile={account:{uuid:'account-id',has_claude_pro:true,has_claude_max:false},organization:{uuid:'org-id',name:'Personal organization',organization_type:'claude_pro'}};
test('live profile overrides stale credential plan and whitelists display metadata',()=>{
  const result=claudeProfile({...profile,access_token:'secret'}, {subscriptionType:'max',accessToken:'secret'},42);
  assert.equal(result.plan,'pro'); assert.equal(result.accountConnection.organizationId,'org-id');
  assert.equal(result.accountConnection.planSource,'profile'); assert.equal(result.accountConnection.verifiedAt,42);
  assert.doesNotMatch(JSON.stringify(result),/secret|accessToken|access_token/);
});
test('missing and failed optional profiles do not invent Max or block usage',async()=>{
  assert.equal(claudeProfile(null).plan,null);
  const result=await readClaudeProfile({accessToken:'test',subscriptionType:'pro'},async()=>{throw Error('unavailable')});
  assert.equal(result.plan,'pro');assert.equal(result.accountConnection,null);
});
test('organization and plan details are escaped and explicit about verification',()=>{
  const c={id:'claude',...claudeProfile({...profile,organization:{...profile.organization,name:'<img onerror=x>'}})};
  const html=claudeConnectionSection(c);
  assert.match(html,/verified with Claude/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
  assert.equal(claudeConnectionSection({id:'claude'}),'');
});
