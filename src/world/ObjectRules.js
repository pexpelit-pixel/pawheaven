import objectRules from './object-rules.json';

export const OBJECT_RULES = objectRules;

function mergeRecord(...records) {
  return Object.assign({}, ...records.filter((record) => record && typeof record === 'object' && !Array.isArray(record)));
}

export function normalizeEntityId(id) {
  return typeof id === 'string' && id.startsWith('prop:') ? id.slice(5) : id;
}

export function getObjectRule(id, fallbackType = null) {
  const entityId = normalizeEntityId(id);
  const entity = typeof entityId === 'string' ? OBJECT_RULES.entities?.[entityId] : null;
  const type = entity?.type || fallbackType || entityId;
  const object = OBJECT_RULES.objects?.[type] || {};
  const defaults = OBJECT_RULES.defaults || {};
  return {
    id: entityId,
    type,
    name: entity?.name || object.name || type || 'Unknown object',
    icon: entity?.icon || object.icon || '📦',
    color: entity?.color || object.color || '#a7b8ad',
    metalness: entity?.metalness ?? object.metalness ?? 0,
    pickup: entity?.pickup ?? object.pickup ?? defaults.pickup ?? false,
    physics: mergeRecord(defaults.physics, object.physics, entity?.physics),
    interaction: mergeRecord(defaults.interaction, object.interaction, entity?.interaction),
    presentation: mergeRecord(defaults.presentation, object.presentation, entity?.presentation)
  };
}

export function getInventoryTokenType(token) {
  if (typeof token !== 'string') return null;
  if (Object.hasOwn(OBJECT_RULES.objects || {}, token) && !token.startsWith('prop:')) return token;
  if (!token.startsWith('prop:')) return null;
  const id = token.slice(5);
  const entity = OBJECT_RULES.entities?.[id];
  if (!entity || !Object.hasOwn(OBJECT_RULES.objects || {}, entity.type)) return null;
  return entity.type;
}

export function getTokenRule(token) {
  const type = getInventoryTokenType(token);
  if (!type) return null;
  return getObjectRule(token, type);
}

export function getMassKg(id, type = null) {
  const value = Number(getObjectRule(id, type).physics.massKg);
  return Number.isFinite(value) && value >= 0 ? value : Number.POSITIVE_INFINITY;
}

export function isPickupAllowed(id, type = null) {
  return getObjectRule(id, type).pickup === true;
}

export function canCarryObject(id, type = null, massOverride = null) {
  const rule = getObjectRule(id, type);
  if (rule.pickup !== true || rule.physics.enabled === false) return false;
  const mass = Number.isFinite(massOverride) ? massOverride : Number(rule.physics.massKg);
  const maxMass = Number(OBJECT_RULES.capacity?.maxPickupMassKg ?? 0);
  const maxCarryMass = Number(OBJECT_RULES.capacity?.maxMouthCarryMassKg ?? maxMass);
  return Number.isFinite(mass) && mass >= 0 && mass <= maxMass && mass <= maxCarryMass;
}

export function inventoryItemMassKg(token) {
  const rule = getTokenRule(token);
  if (!rule || rule.pickup !== true || rule.physics.enabled === false) return Number.POSITIVE_INFINITY;
  const mass = Number(rule.physics.massKg);
  const maximum = Number(OBJECT_RULES.capacity?.maxInventoryItemMassKg ?? 0);
  return Number.isFinite(mass) && mass >= 0 && mass <= maximum ? mass : Number.POSITIVE_INFINITY;
}
