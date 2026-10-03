import { ALL_ISSUES_OF_ANALYSIS, RULE_LABELS, analyzeLayout, createElement, createStarterDocument, findElement, getBoundingBox, normalizeRotation, reconcileResolutions } from './domain';
import type { LayoutRepository } from './repository';
import type { Analysis, ElementKind, IssueResolution, IssueStatusValue, LayoutDocument, LayoutMode, Notice, RenderElement, RuleId, RuleSet, ViewPhase } from './types';

export interface ExpoSketchState {
  phase: ViewPhase;
  document: LayoutDocument;
  renderElements: RenderElement[];
  selectedId: string | null;
  selectedElement: RenderElement | null;
  mode: LayoutMode;
  analysis: Analysis;
  /** 当前分析结果下每条问题的处置状态；key 不存在视为 pending */
  issueStatuses: Record<string, IssueStatusValue>;
  pendingCount: number;
  notice: Notice;
  lastSavedAt: number | null;
}

const toRenderElements = (document: LayoutDocument): RenderElement[] => document.elements.map((element) => {
  const box = getBoundingBox(element);
  return { ...element, displayWidth: box.width, displayHeight: box.height, occupiedArea: Number((box.width * box.height).toFixed(1)) };
});

const starter = createStarterDocument();
const starterRenderElements = toRenderElements(starter);

const issuesOfAnalysis = ALL_ISSUES_OF_ANALYSIS;

/** 由对账后的处置结论推导每条现存问题的状态与待处理数量 */
const deriveIssueStatus = (analysis: Analysis, resolutions: Record<string, IssueResolution>): Pick<ExpoSketchState, 'issueStatuses' | 'pendingCount'> => {
  const issueStatuses: Record<string, IssueStatusValue> = {};
  let pendingCount = 0;
  issuesOfAnalysis(analysis).forEach((issue) => {
    const status = resolutions[issue.key]?.status;
    if (status) issueStatuses[issue.key] = status;
    else pendingCount += 1;
  });
  return { issueStatuses, pendingCount };
};

type Listener = () => void;

export class ExpoSketchViewModel {
  private listeners = new Set<Listener>();
  private stateValue: ExpoSketchState = {
    phase: 'loading',
    document: starter,
    renderElements: starterRenderElements,
    selectedId: 'stage-1',
    selectedElement: starterRenderElements.find((element) => element.id === 'stage-1') ?? null,
    mode: 'edit',
    analysis: analyzeLayout(starter, starter.ruleSet),
    issueStatuses: {},
    pendingCount: 0,
    notice: { tone: 'info', message: '正在恢复最近布局…' },
    lastSavedAt: null,
  };

  constructor(private readonly repository: LayoutRepository) {}

  get state() { return this.stateValue; }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize() {
    try {
      const document = await this.repository.load();
      this.commit({ document, selectedId: document.elements[0]?.id ?? null, phase: 'ready', notice: { tone: 'success', message: '布局已就绪，可开始编辑' } });
      this.persistPrunedResolutions();
    } catch {
      this.commit({ phase: 'error', notice: { tone: 'error', message: '布局读取失败，已载入安全示例' } });
    }
  }

  selectElement(id: string) { this.commit({ selectedId: id }); }

  setMode(mode: LayoutMode) { this.commit({ mode, notice: { tone: 'info', message: mode === 'inspect' ? '检查模式已开启：拖动元素查看即时提示' : mode === 'path' ? '路径模式已开启：入口到重点区域的访问路线已生成' : '编辑模式已开启' } }); }

  addElement(kind: ElementKind) {
    const element = createElement(kind, this.stateValue.document.elements.length, this.stateValue.document.field);
    const document = { ...this.stateValue.document, elements: [...this.stateValue.document.elements, element] };
    this.commitAndPersist({ document, selectedId: element.id, notice: { tone: 'success', message: `${element.name} 已加入场地` } });
  }

  removeSelected() {
    if (!this.stateValue.selectedId) return;
    const removed = findElement(this.stateValue.document, this.stateValue.selectedId);
    const elements = this.stateValue.document.elements.filter((element) => element.id !== this.stateValue.selectedId);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements }, selectedId: elements[0]?.id ?? null, notice: { tone: 'info', message: `${removed?.name ?? '元素'} 已移除` } });
  }

  moveElement(id: string, x: number, y: number) {
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } });
  }

  resizeSelected(width: number, height: number) {
    const id = this.stateValue.selectedId;
    if (!id || width <= 0 || height <= 0) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } });
  }

  rotateSelected() {
    const id = this.stateValue.selectedId;
    if (!id) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, rotation: normalizeRotation(element.rotation + 90) } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements }, notice: { tone: 'info', message: '方向已旋转 90°' } });
  }

  renameSelected(name: string) {
    const id = this.stateValue.selectedId;
    if (!id || !name.trim()) return;
    const elements = this.stateValue.document.elements.map((element) => element.id === id ? { ...element, name: name.trim() } : element);
    this.commitAndPersist({ document: { ...this.stateValue.document, elements } });
  }

  resizeField(width: number, height: number) {
    if (width < 12 || height < 10) return;
    this.commitAndPersist({ document: { ...this.stateValue.document, field: { width: Number(width.toFixed(1)), height: Number(height.toFixed(1)) } }, notice: { tone: 'success', message: '场地尺寸已更新' } });
  }

  renameProject(title: string) {
    if (!title.trim()) return;
    this.commitAndPersist({ document: { ...this.stateValue.document, title: title.trim() } });
  }

  /** 开关某一类检查；关闭后该类问题整体消失，历史处置同步失效 */
  setRuleEnabled(ruleId: RuleId, enabled: boolean) {
    if (this.stateValue.document.ruleSet!.enabledRules[ruleId] === enabled) return;
    const ruleSet: RuleSet = { ...this.stateValue.document.ruleSet!, enabledRules: { ...this.stateValue.document.ruleSet!.enabledRules, [ruleId]: enabled } };
    this.commitAndPersist({ document: { ...this.stateValue.document, ruleSet }, notice: { tone: 'success', message: `已${enabled ? '开启' : '关闭'}「${RULE_LABELS[ruleId]}」检查，相关结论已按当前标准重算` } });
  }

  /** 调整尺寸阈值（米）；阈值变化后所有相关的旧结论自动重算 */
  setRuleThreshold(key: 'minChannelWidth' | 'edgeSetback' | 'minElementSpacing', value: number) {
    if (!Number.isFinite(value) || value < 0) return;
    const rounded = Number(value.toFixed(2));
    if (this.stateValue.document.ruleSet![key] === rounded) return;
    const ruleSet: RuleSet = { ...this.stateValue.document.ruleSet!, [key]: rounded };
    this.commitAndPersist({ document: { ...this.stateValue.document, ruleSet }, notice: { tone: 'success', message: `检查阈值已更新，历史确认/忽略结论已按新标准重算` } });
  }

  /** 确认或忽略一条问题；不存在或已失效的问题 key 会被忽略 */
  resolveIssue(key: string, status: 'confirmed' | 'ignored') {
    const issue = this.stateValue.analysis && issuesOfAnalysis(this.stateValue.analysis).find((item) => item.key === key);
    if (!issue) return;
    const issueResolutions = { ...this.stateValue.document.issueResolutions, [key]: { status, ruleId: issue.ruleId, signature: issue.signature } };
    this.commitAndPersist({ document: { ...this.stateValue.document, issueResolutions } });
  }

  /** 取消一条问题的确认/忽略，恢复为待处理 */
  clearIssueStatus(key: string) {
    if (!this.stateValue.document.issueResolutions?.[key]) return;
    const issueResolutions = { ...this.stateValue.document.issueResolutions };
    delete issueResolutions[key];
    this.commitAndPersist({ document: { ...this.stateValue.document, issueResolutions } });
  }

  resetExample() {
    const document = createStarterDocument();
    this.commitAndPersist({ document, selectedId: 'stage-1', mode: 'edit', notice: { tone: 'success', message: '已恢复示例布局' } });
  }

  private commitAndPersist(patch: Partial<ExpoSketchState>) {
    this.commit(patch);
    void this.persist();
  }

  /** 初始化时可能因规则标准变化清掉了部分旧结论，落盘一次保持存储一致 */
  private persistPrunedResolutions() {
    if (this.stateValue.phase !== 'ready') return;
    void this.persist();
  }

  private async persist() {
    try {
      await this.repository.save(this.stateValue.document);
      this.commit({ lastSavedAt: Date.now() });
    } catch {
      this.commit({ notice: { tone: 'error', message: '本地保存失败，当前编辑仍保留在页面中' } });
    }
  }

  private commit(patch: Partial<ExpoSketchState>) {
    const next = { ...this.stateValue, ...patch };
    const renderElements = toRenderElements(next.document);
    const ruleSet = next.document.ruleSet!;
    const analysis = analyzeLayout(next.document, ruleSet);
    // 阈值/规则/布局变化后，对不上签名的旧结论立即作废
    const issueResolutions = reconcileResolutions(analysis, next.document.issueResolutions ?? {});
    const { issueStatuses, pendingCount } = deriveIssueStatus(analysis, issueResolutions);
    this.stateValue = { ...next, document: { ...next.document, issueResolutions }, renderElements, selectedElement: renderElements.find((element) => element.id === next.selectedId) ?? null, analysis, issueStatuses, pendingCount };
    this.listeners.forEach((listener) => listener());
  }
}
