import { RULE_LABELS } from '../../domain';
import type { Analysis, ExpoElement, IssueStatusValue, LayoutIssue, LayoutMode } from '../../types';

interface AnalysisPanelProps {
  analysis: Analysis;
  elements: ExpoElement[];
  issueStatuses: Record<string, IssueStatusValue>;
  pendingCount: number;
  mode: LayoutMode;
  elementCount: number;
  onResolve: (key: string, status: 'confirmed' | 'ignored') => void;
  onClearStatus: (key: string) => void;
}

const nameOf = (elements: ExpoElement[], id: string) => elements.find((element) => element.id === id)?.name ?? id;

const describeIssue = (issue: LayoutIssue, elements: ExpoElement[]): { label: string; detail: string } => {
  switch (issue.ruleId) {
    case 'overlap':
      return { label: RULE_LABELS.overlap, detail: `${nameOf(elements, issue.firstId)} 与 ${nameOf(elements, issue.secondId)} 重叠 ${issue.amount} m²` };
    case 'bounds':
      return { label: RULE_LABELS.bounds, detail: `${nameOf(elements, issue.elementId)} 到边界的退让不足 ${issue.shortfall} m` };
    case 'channel':
      return { label: RULE_LABELS.channel, detail: `${nameOf(elements, issue.firstId)} 与 ${nameOf(elements, issue.secondId)} 通道仅 ${issue.gap} m` };
    case 'spacing':
      return { label: RULE_LABELS.spacing, detail: `${nameOf(elements, issue.firstId)} 与 ${nameOf(elements, issue.secondId)} 净距仅 ${issue.distance} m` };
  }
};

const statusText: Record<IssueStatusValue, string> = { pending: '待处理', confirmed: '已确认', ignored: '已忽略' };

function IssueRow({ issue, elements, status, onResolve, onClearStatus }: { issue: LayoutIssue; elements: ExpoElement[]; status: IssueStatusValue; onResolve: AnalysisPanelProps['onResolve']; onClearStatus: AnalysisPanelProps['onClearStatus'] }) {
  const { label, detail } = describeIssue(issue, elements);
  return <li className={`issue-row status-${status}`}>
    <div className="issue-copy"><span className="issue-tag">{label}</span><strong>{detail}</strong><em>{statusText[status]}</em></div>
    {status === 'pending'
      ? <div className="issue-actions"><button type="button" onClick={() => onResolve(issue.key, 'confirmed')}>确认</button><button type="button" className="ghost" onClick={() => onResolve(issue.key, 'ignored')}>忽略</button></div>
      : <div className="issue-actions"><button type="button" className="ghost" onClick={() => onClearStatus(issue.key)}>撤销</button></div>}
  </li>;
}

export function AnalysisPanel({ analysis, elements, issueStatuses, pendingCount, mode, elementCount, onResolve, onClearStatus }: AnalysisPanelProps) {
  const allIssues: LayoutIssue[] = [...analysis.overlaps, ...analysis.bounds, ...analysis.channels, ...analysis.spacing];
  const metrics: Array<{ label: string; count: number }> = [
    { label: '重叠', count: analysis.overlaps.length },
    { label: '退让', count: analysis.bounds.length },
    { label: '窄通道', count: analysis.channels.length },
    { label: '间距', count: analysis.spacing.length },
  ];
  const pathMessage = analysis.path ? `${analysis.path.fromName} → ${analysis.path.toName} · ${analysis.path.distance} m` : '需要入口和重点区域才能生成路径';
  const headline = pendingCount ? `${pendingCount} 项待处理` : allIssues.length ? '问题均已处置' : '当前布局通行顺畅';
  return <section className={`analysis-panel analysis-${mode} has-issues-${allIssues.length > 0}`}>
    <div className="analysis-title"><span className="analysis-pulse" /><div><span className="section-kicker">LIVE ANALYSIS</span><strong>{mode === 'path' ? '访问路径预览' : mode === 'inspect' ? '空间检查结果' : '布局概览'}</strong></div></div>
    <div className="analysis-metrics">
      <span><b>{elementCount}</b>元素</span>
      {metrics.map((metric) => <span key={metric.label} className={metric.count ? 'metric-warning' : ''}><b>{metric.count}</b>{metric.label}</span>)}
    </div>
    <div className="analysis-result"><strong>{headline}</strong><small>{pathMessage}</small></div>
    {allIssues.length ? <ul className="issue-list">
      {allIssues.map((issue) => <IssueRow key={issue.key} issue={issue} elements={elements} status={issueStatuses[issue.key] ?? 'pending'} onResolve={onResolve} onClearStatus={onClearStatus} />)}
    </ul> : null}
  </section>;
}
