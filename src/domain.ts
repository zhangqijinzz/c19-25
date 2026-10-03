import type {
  Analysis,
  BoundsIssue,
  ChannelIssue,
  ElementKind,
  ElementSpec,
  ExpoElement,
  FieldSize,
  IssueResolution,
  LayoutDocument,
  LayoutIssue,
  OverlapIssue,
  PathPreview,
  RuleId,
  RuleSet,
  SpacingIssue,
} from './types';

/**
 * 默认规则集沿用旧标准：老方案缺少配置时按此打开，
 * 不会因为配置缺失而凭空产生新问题（间距检查默认关闭、边界退让为 0）。
 */
export const DEFAULT_RULE_SET: RuleSet = {
  enabledRules: { overlap: true, bounds: true, channel: true, spacing: false },
  minChannelWidth: 1.2,
  edgeSetback: 0,
  minElementSpacing: 1,
};

export const RULE_LABELS: Record<RuleId, string> = {
  overlap: '元素重叠',
  bounds: '边界退让',
  channel: '最小通道',
  spacing: '元素间距',
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const readThreshold = (value: unknown, fallback: number) => {
  const numberValue = typeof value === 'string' ? Number(value) : value;
  return isFiniteNumber(numberValue) && numberValue >= 0 ? Number(numberValue.toFixed(2)) : fallback;
};

/** 用默认值补全 / 修正一份外部传入（可能来自旧方案或损坏 JSON）的规则集 */
export const normalizeRuleSet = (input?: Partial<RuleSet> | null): RuleSet => {
  const source = input && typeof input === 'object' ? input : {};
  const sourceEnabled = source.enabledRules as Partial<Record<RuleId, unknown>> | undefined;
  const enabledRules = (Object.keys(DEFAULT_RULE_SET.enabledRules) as RuleId[]).reduce(
    (result, ruleId) => {
      result[ruleId] = typeof sourceEnabled?.[ruleId] === 'boolean' ? sourceEnabled[ruleId] : DEFAULT_RULE_SET.enabledRules[ruleId];
      return result;
    },
    {} as Record<RuleId, boolean>,
  );
  return {
    enabledRules,
    minChannelWidth: readThreshold(source.minChannelWidth, DEFAULT_RULE_SET.minChannelWidth),
    edgeSetback: readThreshold(source.edgeSetback, DEFAULT_RULE_SET.edgeSetback),
    minElementSpacing: readThreshold(source.minElementSpacing, DEFAULT_RULE_SET.minElementSpacing),
  };
};

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
  ruleSet: DEFAULT_RULE_SET,
  issueResolutions: {},
  elements: [
    { id: 'entry-1', kind: 'entrance', name: '主入口', x: 1, y: 8.25, width: 2.5, height: 1.5, rotation: 0 },
    { id: 'stage-1', kind: 'stage', name: '分享舞台', x: 10, y: 1.5, width: 8, height: 4, rotation: 0 },
    { id: 'booth-1', kind: 'booth', name: '香氛展位', x: 4, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'booth-2', kind: 'booth', name: '手作展位', x: 19, y: 2, width: 5, height: 3.5, rotation: 0 },
    { id: 'seating-1', kind: 'seating', name: '休息座席', x: 10, y: 11, width: 6, height: 3, rotation: 0 },
  ],
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

export interface ElementBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export const getBoundingBox = (element: ExpoElement): ElementBox => {
  const isQuarterTurn = normalizeRotation(element.rotation) % 180 !== 0;
  const width = isQuarterTurn ? element.height : element.width;
  const height = isQuarterTurn ? element.width : element.height;
  return { left: element.x, top: element.y, right: element.x + width, bottom: element.y + height, width, height };
};

const round1 = (value: number) => Number(value.toFixed(1));

const pairKey = (firstId: string, secondId: string) => (firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`);

const signatureFor = (ruleId: RuleId, threshold: number, measured: number) => `${ruleId}:${round1(threshold)}:${round1(measured)}`;

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
        const amount = round1(overlapX * overlapY);
        issues.push({ key: `overlap:${pairKey(elements[i].id, elements[j].id)}`, ruleId: 'overlap', signature: signatureFor('overlap', 0, amount), firstId: elements[i].id, secondId: elements[j].id, amount });
      }
    }
  }
  return issues;
};

/**
 * 边界退让检查：元素到任一场地边界的净距小于要求即记录。
 * 净距为负时表示元素本身越出场地，shortfall 为还差多少米才满足要求。
 */
export const findBoundsIssues = (field: FieldSize, elements: ExpoElement[], edgeSetback: number): BoundsIssue[] =>
  elements.flatMap((element) => {
    const box = getBoundingBox(element);
    const clearances = [box.left, box.top, field.width - box.right, field.height - box.bottom];
    const minClearance = Math.min(...clearances);
    const shortfall = round1(edgeSetback - minClearance);
    return shortfall > 0 ? [{ key: `bounds:${element.id}`, ruleId: 'bounds', signature: signatureFor('bounds', edgeSetback, minClearance), elementId: element.id, shortfall }] : [];
  });

/** 通道宽度：两矩形在某一轴向上相对时，另一轴向的正对净距 */
export const findNarrowChannels = (elements: ExpoElement[], minChannelWidth: number): ChannelIssue[] => {
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
      if (gap > 0 && gap < minChannelWidth) {
        issues.push({ key: `channel:${pairKey(elements[i].id, elements[j].id)}`, ruleId: 'channel', signature: signatureFor('channel', minChannelWidth, gap), firstId: elements[i].id, secondId: elements[j].id, gap: round1(gap) });
      }
    }
  }
  return issues;
};

/** 两矩形之间的最小距离：重叠返回 0，否则取间隔构成的欧氏距离 */
const boxDistance = (first: ElementBox, second: ElementBox): number => {
  const dx = Math.max(0, first.left - second.right, second.left - first.right);
  const dy = Math.max(0, first.top - second.bottom, second.top - first.bottom);
  return Math.hypot(dx, dy);
};

/**
 * 元素净距检查：不重叠的任意两个元素之间最小距离低于要求即记录。
 * 与通道检查互补——通道只看正对方向，这里连斜对角布置也覆盖。
 */
export const findSpacingIssues = (elements: ExpoElement[], minElementSpacing: number): SpacingIssue[] => {
  const issues: SpacingIssue[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const first = getBoundingBox(elements[i]);
    for (let j = i + 1; j < elements.length; j += 1) {
      const second = getBoundingBox(elements[j]);
      const distanceValue = boxDistance(first, second);
      if (distanceValue > 1e-9 && distanceValue < minElementSpacing) {
        issues.push({ key: `spacing:${pairKey(elements[i].id, elements[j].id)}`, ruleId: 'spacing', signature: signatureFor('spacing', minElementSpacing, distanceValue), firstId: elements[i].id, secondId: elements[j].id, distance: round1(distanceValue) });
      }
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

/** 按规则集执行检查；被关闭的类别直接返回空结果 */
export const analyzeLayout = (document: LayoutDocument, ruleSet: RuleSet = normalizeRuleSet(document.ruleSet)): Analysis => ({
  overlaps: ruleSet.enabledRules.overlap ? findOverlaps(document.elements) : [],
  bounds: ruleSet.enabledRules.bounds ? findBoundsIssues(document.field, document.elements, ruleSet.edgeSetback) : [],
  channels: ruleSet.enabledRules.channel ? findNarrowChannels(document.elements, ruleSet.minChannelWidth) : [],
  spacing: ruleSet.enabledRules.spacing ? findSpacingIssues(document.elements, ruleSet.minElementSpacing) : [],
  path: createPathPreview(document.elements),
});

export const ALL_ISSUES_OF_ANALYSIS = (analysis: Analysis): LayoutIssue[] => [
  ...analysis.overlaps,
  ...analysis.bounds,
  ...analysis.channels,
  ...analysis.spacing,
];

export const findIssue = (analysis: Analysis, key: string): LayoutIssue | null => ALL_ISSUES_OF_ANALYSIS(analysis).find((issue) => issue.key === key) ?? null;

/**
 * 用最新分析结果对账历史处置结论：
 * 问题仍然存在且 signature（含阈值与实测值）一致时保留；
 * 阈值调整、规则开关变化或布局移动后 signature 对不上的旧结论一律清除，
 * 避免旧标准下的确认/忽略继续挂着。
 */
export const reconcileResolutions = (
  analysis: Analysis,
  resolutions: Record<string, IssueResolution>,
): Record<string, IssueResolution> => {
  const active = new Map(ALL_ISSUES_OF_ANALYSIS(analysis).map((issue) => [issue.key, { signature: issue.signature, ruleId: issue.ruleId }]));
  const next: Record<string, IssueResolution> = {};
  Object.entries(resolutions).forEach(([key, resolution]) => {
    const issue = active.get(key);
    if (issue && issue.signature === resolution.signature && issue.ruleId === resolution.ruleId) next[key] = resolution;
  });
  return next;
};

export const findElement = (document: LayoutDocument, id: string | null) => document.elements.find((element) => element.id === id) ?? null;

export const formatArea = (field: FieldSize) => `${field.width} × ${field.height} m`;
