import { Layer } from './contracts';

/**
 * Display metadata for the 6 verification layers (labels and column order only).
 * The rules themselves, their dependencies and the ruleset hash come from GET /api/v1/rules.
 */
export const RULE_LAYERS: { layer: Layer; label: string; short: string; description: string }[] = [
  { layer: 'TYPE', label: 'Type & schema', short: 'Type', description: 'INR money fields, pattern codes and the owning PolicyCenter entity are well formed.' },
  { layer: 'RANGE', label: 'Range & limits', short: 'Range', description: 'Aggregate, sublimits, deductibles and waiting periods sit inside regulated bounds.' },
  { layer: 'CONSISTENCY', label: 'Consistency', short: 'Consistency', description: 'Sublimits fit the aggregate, deductibles stay below limits, nothing contradicts itself.' },
  { layer: 'RULE_MATCH', label: 'Rule match', short: 'Rule match', description: 'Mandatory coverages, exclusions and conditions such as CERT-In 6-hour notice are present.' },
  { layer: 'SOURCE', label: 'Source integrity', short: 'Source', description: 'Every citation exists and matches the stored regulation byte for byte.' },
  { layer: 'GROUNDING', label: 'Grounding', short: 'Grounding', description: 'Every number in the prose matches a value the gate has already verified.' },
];

export const LAYER_ORDER: Record<string, number> = RULE_LAYERS.reduce((acc, l, i) => {
  acc[l.layer] = i;
  return acc;
}, {} as Record<string, number>);

export const LAYER_LABEL: Record<string, string> = Object.fromEntries(RULE_LAYERS.map(l => [l.layer, l.label]));
