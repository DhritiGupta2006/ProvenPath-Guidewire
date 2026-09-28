import { Layer } from './contracts';

/**
 * Display metadata for the 6 verification layers (labels, colours and column order only).
 * The rules themselves, their dependencies and the ruleset hash come from GET /api/v1/rules.
 */
export const RULE_LAYERS: { layer: Layer; label: string; description: string; color: string }[] = [
  { layer: 'TYPE', label: '1. Type & Schema', description: 'INR money fields, pattern codes, owning entity', color: '#6366f1' },
  { layer: 'RANGE', label: '2. Range & Limits', description: 'Aggregate, sublimits, deductibles, waiting periods', color: '#ec4899' },
  { layer: 'CONSISTENCY', label: '3. Consistency', description: 'Sublimits vs aggregate, deductible vs limit', color: '#8b5cf6' },
  { layer: 'RULE_MATCH', label: '4. Rule Match', description: 'Mandatory coverages, exclusions, CERT-In condition', color: '#06b6d4' },
  { layer: 'SOURCE', label: '5. Source Integrity', description: 'Citation exists and matches the stored text byte-for-byte', color: '#10b981' },
  { layer: 'GROUNDING', label: '6. Grounding', description: 'Every number in the prose matches a verified value', color: '#f59e0b' },
];

export const LAYER_ORDER: Record<string, number> = RULE_LAYERS.reduce((acc, l, i) => {
  acc[l.layer] = i;
  return acc;
}, {} as Record<string, number>);
