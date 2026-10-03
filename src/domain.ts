import type {
  Analysis,
  BoundsIssue,
  ChannelIssue,
  CheckCategory,
  ElementKind,
  ElementSpec,
  ExpoElement,
  FieldSize,
  IssueResolution,
  LayoutDocument,
  PathPreview,
  OverlapIssue,
  RuleSet,
  SetbackIssue,
  SpacingIssue,
} from './types';

export const MIN_CHANNEL = 1.2;

export const DEFAULT_RULE_SET: RuleSet = {
  checks: { overlap: true, bounds: true, channel: true, setback: false, spacing: false },
  minChannel: MIN_CHANNEL,
  boundarySetback: 0.5,
  minSpacing: 0.8,
};

export const createDefaultRuleSet = (): RuleSet => ({
  checks: { ...DEFAULT_RULE_SET.checks },
  minChannel: DEFAULT_RULE_SET.minChannel,
  boundarySetback: DEFAULT_RULE_SET.boundarySetback,
  minSpacing: DEFAULT_RULE_SET.minSpacing,
});

const clampThreshold = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : fallback;

export const normalizeRuleSet = (value: unknown): RuleSet => {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<RuleSet>;
  const rawChecks = (raw.checks && typeof raw.checks === 'object' ? raw.checks : {}) as Partial<Record<CheckCategory, unknown>>;
  const checks = { ...DEFAULT_RULE_SET.checks };
  (Object.keys(checks) as CheckCategory[]).forEach((category) => {
    if (typeof rawChecks[category] === 'boolean') checks[category] = rawChecks[category] as boolean;
  });
  return {
    checks,
    minChannel: clampThreshold(raw.minChannel, DEFAULT_RULE_SET.minChannel),
    boundarySetback: clampThreshold(raw.boundarySetback, DEFAULT_RULE_SET.boundarySetback),
    minSpacing: clampThreshold(raw.minSpacing, DEFAULT_RULE_SET.minSpacing),
  };
};

export const normalizeResolutions = (value: unknown): Record<string, IssueResolution> => {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, IssueResolution> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, resolution]) => {
    if (resolution === 'confirmed' || resolution === 'ignored') result[key] = resolution;
  });
  return result;
};

export const getRuleSet = (document: LayoutDocument): RuleSet => normalizeRuleSet(document.rules);

export const issueKey = (category: CheckCategory, ...ids: string[]): string => `${category}:${ids.join('|')}`;

export const countIssues = (analysis: Analysis): number =>
  analysis.overlaps.length + analysis.bounds.length + analysis.channels.length + analysis.setbacks.length + analysis.spacings.length;

export const filterOpenIssues = (analysis: Analysis, resolutions: Record<string, IssueResolution>): Analysis => ({
  ...analysis,
  overlaps: analysis.overlaps.filter((issue) => !resolutions[issueKey('overlap', issue.firstId, issue.secondId)]),
  bounds: analysis.bounds.filter((issue) => !resolutions[issueKey('bounds', issue.elementId)]),
  channels: analysis.channels.filter((issue) => !resolutions[issueKey('channel', issue.firstId, issue.secondId)]),
  setbacks: analysis.setbacks.filter((issue) => !resolutions[issueKey('setback', issue.elementId)]),
  spacings: analysis.spacings.filter((issue) => !resolutions[issueKey('spacing', issue.firstId, issue.secondId)]),
});

export const ELEMENT_SPECS: Record<ElementKind, ElementSpec> = {
  booth: { kind: 'booth', label: '标准展位', eyebrow: 'BOOTH', icon: '▦', color: '#e7f0ff', width: 5, height: 3.5 },
  stage: { kind: 'stage', label: '主舞台', eyebrow: 'STAGE', icon: '✦', color: '#f2e9ff', width: 8, height: 4 },
  seating: { kind: 'seating', label: '观众座席', eyebrow: 'SEATING', icon: '▤', color: '#e6f7f2', width: 6, height: 3 },
  entrance: { kind: 'entrance', label: '入口', eyebrow: 'ENTRY', icon: '↗', color: '#fff2d8', width: 2.5, height: 1.5 },
};

export const createStarterDocument = (): LayoutDocument => ({
  version: 1,
  title: '春日创意市集 · A 区',
  field: { width: 28, height: 18 },
  elements: [
    { id: 'entry-1', kind: 'entrance', name: '主入口', x: 1, y: 8.25, width: 2.5, height: 1.5, rotation: 0 },
    { id: 'stage-1', kind: 'stage', name: '分享舞台', x: 10, y: 1.5, width: 8, height: 4, rotation: 0 },
    { id: 'booth-1', kind: 'booth', name: '香氛展位', x: 4, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'booth-2', kind: 'booth', name: '手作展位', x: 19, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'seating-1', kind: 'seating', name: '休息座席', x: 10, y: 11, width: 6, height: 3, rotation: 0 },
  ],
  rules: createDefaultRuleSet(),
  resolutions: {},
});

export const createElement = (kind: ElementKind, index: number, field: FieldSize): ExpoElement => {
  const spec = ELEMENT_SPECS[kind];
  const offset = Math.min(index * 0.65, 4);
  return {
    id: `${kind}-${Date.now()}-${index}`,
    kind,
    name: `${spec.label} ${index + 1}`,
    x: Math.max(0.5, Math.min(field.width - spec.width - 0.5, (field.width - spec.width) / 2 + offset)),
    y: Math.max(0.5, Math.min(field.height - spec.height - 0.5, (field.height - spec.height) / 2 + offset)),
    width: spec.width,
    height: spec.height,
    rotation: 0,
  };
};

export const normalizeRotation = (rotation: number): number => ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;

export const getBoundingBox = (element: ExpoElement) => {
  const isQuarterTurn = normalizeRotation(element.rotation) % 180 !== 0;
  const width = isQuarterTurn ? element.height : element.width;
  const height = isQuarterTurn ? element.width : element.height;
  return { left: element.x, top: element.y, right: element.x + width, bottom: element.y + height, width, height };
};

const intersectionSize = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

export const findOverlaps = (elements: ExpoElement[]): OverlapIssue[] => {
  const issues: OverlapIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const overlapX = intersectionSize(first.left, first.right, second.left, second.right);
      const overlapY = intersectionSize(first.top, first.bottom, second.top, second.bottom);
      if (overlapX > 0 && overlapY > 0) {
        issues.push({ firstId: elements[i].id, secondId: elements[j].id, amount: Number((overlapX * overlapY).toFixed(1)) });
      }
    }
  }
  return issues;
};

export const findBoundsIssues = (field: FieldSize, elements: ExpoElement[]): BoundsIssue[] =>
  elements.flatMap((element) => {
    const box = getBoundingBox(element);
    const overflow = Math.max(0, -box.left, -box.top, box.right - field.width, box.bottom - field.height);
    return overflow > 0 ? [{ elementId: element.id, overflow: Number(overflow.toFixed(1)) }] : [];
  });

export const findNarrowChannels = (elements: ExpoElement[], minChannel: number = MIN_CHANNEL): ChannelIssue[] => {
  const issues: ChannelIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const verticalOverlap = intersectionSize(first.top, first.bottom, second.top, second.bottom);
      const horizontalOverlap = intersectionSize(first.left, first.right, second.left, second.right);
      const horizontalGap = first.right <= second.left ? second.left - first.right : second.right <= first.left ? first.left - second.right : 0;
      const verticalGap = first.bottom <= second.top ? second.top - first.bottom : second.bottom <= first.top ? first.top - second.bottom : 0;
      const gap = verticalOverlap > 0 ? horizontalGap : horizontalOverlap > 0 ? verticalGap : 0;
      if (gap > 0 && gap < minChannel) issues.push({ firstId: elements[i].id, secondId: elements[j].id, gap: Number(gap.toFixed(1)) });
    }
  }
  return issues;
};

export const findSetbackIssues = (field: FieldSize, elements: ExpoElement[], setback: number): SetbackIssue[] => {
  if (setback <= 0) return [];
  return elements.flatMap((element) => {
    const box = getBoundingBox(element);
    const clearance = Math.min(box.left, box.top, field.width - box.right, field.height - box.bottom);
    return clearance < setback ? [{ elementId: element.id, clearance: Number(clearance.toFixed(1)) }] : [];
  });
};

export const findSpacingIssues = (elements: ExpoElement[], minSpacing: number): SpacingIssue[] => {
  const issues: SpacingIssue[] = [];
  if (minSpacing <= 0) return issues;
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const dx = Math.max(0, first.left - second.right, second.left - first.right);
      const dy = Math.max(0, first.top - second.bottom, second.top - first.bottom);
      const gap = Math.hypot(dx, dy);
      if (gap > 0 && gap < minSpacing) issues.push({ firstId: elements[i].id, secondId: elements[j].id, gap: Number(gap.toFixed(1)) });
    }
  }
  return issues;
};

const distance = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(second.x - first.x, second.y - first.y);

export const createPathPreview = (elements: ExpoElement[]): PathPreview | null => {
  const entrance = elements.find((element) => element.kind === 'entrance');
  const target = elements.find((element) => element.kind === 'stage') ?? elements.find((element) => element.kind !== 'entrance');
  if (!entrance || !target) return null;
  const startBox = getBoundingBox(entrance);
  const targetBox = getBoundingBox(target);
  const start = { x: startBox.left + startBox.width / 2, y: startBox.top + startBox.height / 2 };
  const end = { x: targetBox.left + targetBox.width / 2, y: targetBox.top + targetBox.height / 2 };
  const elbow = { x: end.x, y: start.y };
  return { points: [start, elbow, end], distance: Number((distance(start, elbow) + distance(elbow, end)).toFixed(1)), fromName: entrance.name, toName: target.name };
};

export const analyzeLayout = (document: LayoutDocument, rules: RuleSet = getRuleSet(document)): Analysis => ({
  overlaps: rules.checks.overlap ? findOverlaps(document.elements) : [],
  bounds: rules.checks.bounds ? findBoundsIssues(document.field, document.elements) : [],
  channels: rules.checks.channel ? findNarrowChannels(document.elements, rules.minChannel) : [],
  setbacks: rules.checks.setback ? findSetbackIssues(document.field, document.elements, rules.boundarySetback) : [],
  spacings: rules.checks.spacing ? findSpacingIssues(document.elements, rules.minSpacing) : [],
  path: createPathPreview(document.elements),
});

export const findElement = (document: LayoutDocument, id: string | null) => document.elements.find((element) => element.id === id) ?? null;

export const formatArea = (field: FieldSize) => `${field.width} × ${field.height} m`;
