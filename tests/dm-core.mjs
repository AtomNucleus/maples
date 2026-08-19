import assert from 'node:assert/strict';
import {
  DM_EVENT_CATALOG,
  buildDirectorPrompt,
  deterministicDecision,
  extractJsonObject,
  getEligibleEventIds,
  validateDecision
} from '../src/game/dm/DMCore.js';

function snapshot(overrides = {}) {
  return {
    player: { hpRatio: 0.8, manaRatio: 0.7, level: 7, ...(overrides.player || {}) },
    encounter: {
      kills: 2,
      objectiveKills: 8,
      living: 4,
      bossAwake: false,
      bossPending: false,
      ...(overrides.encounter || {})
    },
    pacing: { secondsInRun: 40 },
    reason: overrides.reason || 'test'
  };
}

{
  const allowed = getEligibleEventIds(snapshot({ player: { hpRatio: 0.25 } }), []);
  assert.ok(allowed.includes('ember_grace'), 'low health should make the authored boon eligible');
  const decision = deterministicDecision(snapshot({ player: { hpRatio: 0.25 } }), []);
  assert.equal(decision.event, 'ember_grace', 'fallback director should prefer a boon for a badly hurt player');
}

{
  const state = snapshot({ encounter: { living: 1, kills: 2 } });
  const allowed = getEligibleEventIds(state, []);
  assert.ok(allowed.includes('briar_reinforcement'), 'thin encounters should make reinforcement eligible');
  assert.equal(deterministicDecision(state, []).event, 'briar_reinforcement');
}

{
  const allowed = ['hidden_oath', 'warden_warning'];
  const decision = validateDecision('{"event":"hidden_oath","reason":"pacing"}', allowed);
  assert.deepEqual(decision, { event: 'hidden_oath', reason: 'pacing', source: 'ai' });
}

{
  const wrapped = 'Sure. Here is the result: {"event":"warden_warning","reason":"tension"}';
  assert.equal(extractJsonObject(wrapped)?.event, 'warden_warning', 'validator should recover the first JSON object from tiny-model chatter');
  assert.equal(validateDecision(wrapped, ['warden_warning'])?.event, 'warden_warning');
}

{
  assert.equal(validateDecision('{"event":"grant_legendary_sword"}', ['hidden_oath']), null, 'invented event IDs must be rejected');
  assert.equal(validateDecision('{"event":"ember_grace"}', ['hidden_oath']), null, 'an authored but currently illegal event must be rejected');
}

{
  const allowed = getEligibleEventIds(snapshot({ player: { hpRatio: 0.3 } }), ['ember_grace']);
  assert.ok(!allowed.includes('ember_grace'), 'one-shot authored beats should not be offered twice');
}

{
  const prompt = buildDirectorPrompt(snapshot(), ['hidden_oath']);
  assert.ok(prompt.includes('Choose exactly ONE authored event ID'));
  assert.ok(prompt.includes('hidden_oath'));
  assert.ok(!prompt.includes('grant_legendary_sword'));
}

for (const event of Object.values(DM_EVENT_CATALOG)) {
  assert.ok(event.id && event.action && event.copy, `catalog event ${event.id || '<missing>'} must be fully authored`);
}

console.log('DM core tests passed');
