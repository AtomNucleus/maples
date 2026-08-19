export const DM_EVENT_CATALOG = Object.freeze({
  hidden_oath: Object.freeze({
    id: 'hidden_oath',
    action: 'REVEAL_OMEN',
    label: 'The Hidden Oath',
    copy: 'The roots whisper of an older oath beneath the shrine. Thornmaw is guarding more than the glade.'
  }),
  ember_grace: Object.freeze({
    id: 'ember_grace',
    action: 'GRANT_BOON',
    label: 'Ember Grace',
    copy: 'A warm ember answers Rowan’s resolve. The grove lends strength for what comes next.',
    healFraction: 0.14,
    manaFraction: 0.22
  }),
  briar_reinforcement: Object.freeze({
    id: 'briar_reinforcement',
    action: 'SUMMON_REINFORCEMENT',
    label: 'Briar Reinforcement',
    copy: 'The corrupted thicket recoils, then answers with another hunter.',
    count: 1
  }),
  warden_warning: Object.freeze({
    id: 'warden_warning',
    action: 'REVEAL_OMEN',
    label: 'Warden’s Warning',
    copy: 'A horn-like groan rolls through the trees. Something ancient has noticed every fallen Briarbound.'
  })
});

export const DM_EVENT_IDS = Object.freeze(Object.keys(DM_EVENT_CATALOG));

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function getEligibleEventIds(snapshot = {}, seen = []) {
  const seenSet = new Set(seen);
  const hpRatio = clamp01(snapshot?.player?.hpRatio ?? 1);
  const living = Math.max(0, snapshot?.encounter?.living ?? 0);
  const kills = Math.max(0, snapshot?.encounter?.kills ?? 0);
  const objectiveKills = Math.max(1, snapshot?.encounter?.objectiveKills ?? 8);
  const bossAwake = Boolean(snapshot?.encounter?.bossAwake);
  const ids = [];

  if (!seenSet.has('hidden_oath') && !bossAwake) ids.push('hidden_oath');
  if (!seenSet.has('ember_grace') && hpRatio < 0.72 && !bossAwake) ids.push('ember_grace');
  if (!seenSet.has('briar_reinforcement') && living <= 3 && kills < objectiveKills - 1 && !bossAwake) ids.push('briar_reinforcement');
  if (!seenSet.has('warden_warning') && kills >= Math.ceil(objectiveKills * 0.5) && !bossAwake) ids.push('warden_warning');

  return ids.length ? ids : ['hidden_oath'];
}

export function deterministicDecision(snapshot = {}, seen = []) {
  const allowed = getEligibleEventIds(snapshot, seen);
  const hpRatio = clamp01(snapshot?.player?.hpRatio ?? 1);
  const living = Math.max(0, snapshot?.encounter?.living ?? 0);
  const kills = Math.max(0, snapshot?.encounter?.kills ?? 0);

  let event = allowed[0];
  if (hpRatio < 0.42 && allowed.includes('ember_grace')) event = 'ember_grace';
  else if (living <= 2 && allowed.includes('briar_reinforcement')) event = 'briar_reinforcement';
  else if (kills >= 4 && allowed.includes('warden_warning')) event = 'warden_warning';
  else if (allowed.includes('hidden_oath')) event = 'hidden_oath';

  return {
    event,
    reason: 'deterministic_fallback',
    source: 'standard'
  };
}

export function extractJsonObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const first = value.indexOf('{');
  const last = value.lastIndexOf('}');
  if (first < 0 || last <= first) return null;

  try {
    return JSON.parse(value.slice(first, last + 1));
  } catch {
    return null;
  }
}

export function validateDecision(candidate, allowedEventIds) {
  const parsed = extractJsonObject(candidate);
  if (!parsed || typeof parsed.event !== 'string') return null;
  if (!Array.isArray(allowedEventIds) || !allowedEventIds.includes(parsed.event)) return null;
  if (!DM_EVENT_CATALOG[parsed.event]) return null;

  return {
    event: parsed.event,
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 160) : 'local_model',
    source: 'ai'
  };
}

export function buildDirectorPrompt(snapshot, allowedEventIds) {
  return [
    'You are the local Dungeon Master director for a fantasy action RPG.',
    'Choose exactly ONE authored event ID from ALLOWED_EVENTS.',
    'Do not invent mechanics, rewards, enemies, locations, IDs, numbers, or new actions.',
    'Favor pacing: help a badly hurt player; otherwise vary tension and story revelation.',
    'Return JSON only in this exact shape: {"event":"<id>","reason":"<short reason>"}.',
    '',
    `ALLOWED_EVENTS: ${JSON.stringify(allowedEventIds)}`,
    `WORLD_STATE: ${JSON.stringify(snapshot)}`
  ].join('\n');
}
