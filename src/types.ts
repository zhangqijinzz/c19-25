export type ElementKind = 'booth' | 'stage' | 'seating' | 'entrance';
export type LayoutMode = 'edit' | 'inspect' | 'path';
export type ViewPhase = 'loading' | 'ready' | 'error';

/** 可配置的检查规则类别 */
export type RuleId = 'overlap' | 'bounds' | 'channel' | 'spacing';

export interface ExpoElement {
  id: string;
  kind: ElementKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface RenderElement extends ExpoElement {
  displayWidth: number;
  displayHeight: number;
  occupiedArea: number;
}

export interface FieldSize {
  width: number;
  height: number;
}

/**
 * 检查规则集：随方案一起保存。
 * enabledRules 控制关注哪几类问题；thresholds 为各类尺寸阈值，单位米。
 */
export interface RuleSet {
  enabledRules: Record<RuleId, boolean>;
  /** 正对元素之间的最小通道宽度 */
  minChannelWidth: number;
  /** 元素到场地边界的最小退让距离（0 表示仅检查越界） */
  edgeSetback: number;
  /** 任意两个元素之间的最小净距 */
  minElementSpacing: number;
}

/** 一条检查结论的处置状态：待处理 / 已确认 / 已忽略 */
export type IssueStatusValue = 'pending' | 'confirmed' | 'ignored';

/**
 * 已处置（确认或忽略）的检查结论。
 * signature 绑定规则阈值与实测值：阈值或布局变化后签名失效，结论需重算。
 */
export interface IssueResolution {
  status: 'confirmed' | 'ignored';
  ruleId: RuleId;
  signature: string;
}

export interface LayoutDocument {
  version: 1;
  title: string;
  field: FieldSize;
  elements: ExpoElement[];
  /** 旧方案可能缺少该字段，读取时按默认规则集补齐 */
  ruleSet?: RuleSet;
  /** key 为问题稳定标识（见 domain 中的 issue key 规则） */
  issueResolutions?: Record<string, IssueResolution>;
}

export interface ElementSpec {
  kind: ElementKind;
  label: string;
  eyebrow: string;
  icon: string;
  color: string;
  width: number;
  height: number;
}

export interface OverlapIssue {
  key: string;
  ruleId: 'overlap';
  signature: string;
  firstId: string;
  secondId: string;
  amount: number;
}

export interface BoundsIssue {
  key: string;
  ruleId: 'bounds';
  signature: string;
  elementId: string;
  /** 距离满足退让要求还差多少米（负值净距即越界） */
  shortfall: number;
}

export interface ChannelIssue {
  key: string;
  ruleId: 'channel';
  signature: string;
  firstId: string;
  secondId: string;
  gap: number;
}

export interface SpacingIssue {
  key: string;
  ruleId: 'spacing';
  signature: string;
  firstId: string;
  secondId: string;
  distance: number;
}

export type LayoutIssue = OverlapIssue | BoundsIssue | ChannelIssue | SpacingIssue;

export interface PathPreview {
  points: Array<{ x: number; y: number }>;
  distance: number;
  fromName: string;
  toName: string;
}

export interface Analysis {
  overlaps: OverlapIssue[];
  bounds: BoundsIssue[];
  channels: ChannelIssue[];
  spacing: SpacingIssue[];
  path: PathPreview | null;
}

export interface Notice {
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
