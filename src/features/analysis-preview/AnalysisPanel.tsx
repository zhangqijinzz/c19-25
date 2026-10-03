import { countIssues, filterOpenIssues, issueKey } from '../../domain';
import type { Analysis, ExpoElement, IssueResolution, LayoutMode } from '../../types';

interface AnalysisPanelProps {
  analysis: Analysis;
  resolutions: Record<string, IssueResolution>;
  elements: ExpoElement[];
  mode: LayoutMode;
  elementCount: number;
  onConfirm: (key: string) => void;
  onIgnore: (key: string) => void;
  onRestore: (key: string) => void;
}

interface IssueRow { key: string; text: string; }

export function AnalysisPanel({ analysis, resolutions, elements, mode, elementCount, onConfirm, onIgnore, onRestore }: AnalysisPanelProps) {
  const open = filterOpenIssues(analysis, resolutions);
  const issueCount = countIssues(open);
  const pathMessage = analysis.path ? `${analysis.path.fromName} → ${analysis.path.toName} · ${analysis.path.distance} m` : '需要入口和重点区域才能生成路径';
  const nameOf = (id: string) => elements.find((element) => element.id === id)?.name ?? id;
  const rows: IssueRow[] = [
    ...analysis.overlaps.map((issue) => ({ key: issueKey('overlap', issue.firstId, issue.secondId), text: `${nameOf(issue.firstId)} 与 ${nameOf(issue.secondId)} 重叠 ${issue.amount} m²` })),
    ...analysis.bounds.map((issue) => ({ key: issueKey('bounds', issue.elementId), text: `${nameOf(issue.elementId)} 超出场地边界 ${issue.overflow} m` })),
    ...analysis.channels.map((issue) => ({ key: issueKey('channel', issue.firstId, issue.secondId), text: `${nameOf(issue.firstId)} 与 ${nameOf(issue.secondId)} 之间通道仅 ${issue.gap} m` })),
    ...analysis.setbacks.map((issue) => ({ key: issueKey('setback', issue.elementId), text: `${nameOf(issue.elementId)} 距场地边界仅 ${issue.clearance} m` })),
    ...analysis.spacings.map((issue) => ({ key: issueKey('spacing', issue.firstId, issue.secondId), text: `${nameOf(issue.firstId)} 与 ${nameOf(issue.secondId)} 间距仅 ${issue.gap} m` })),
  ];
  const openRows = rows.filter((row) => !resolutions[row.key]);
  const resolvedRows = rows.filter((row) => resolutions[row.key]);
  return <section className={`analysis-panel analysis-${mode}`}>
    <div className="analysis-title"><span className="analysis-pulse" /><div><span className="section-kicker">LIVE ANALYSIS</span><strong>{mode === 'path' ? '访问路径预览' : mode === 'inspect' ? '空间检查结果' : '布局概览'}</strong></div></div>
    <div className="analysis-metrics"><span><b>{elementCount}</b>元素</span><span className={open.overlaps.length ? 'metric-warning' : ''}><b>{open.overlaps.length}</b>重叠</span><span className={open.bounds.length ? 'metric-warning' : ''}><b>{open.bounds.length}</b>越界</span><span className={open.channels.length ? 'metric-warning' : ''}><b>{open.channels.length}</b>窄通道</span><span className={open.setbacks.length ? 'metric-warning' : ''}><b>{open.setbacks.length}</b>退让</span><span className={open.spacings.length ? 'metric-warning' : ''}><b>{open.spacings.length}</b>间距</span></div>
    <div className="analysis-result"><strong>{issueCount ? `${issueCount} 项需要关注` : '当前布局通行顺畅'}{resolvedRows.length ? ` · ${resolvedRows.length} 项已处理` : ''}</strong><small>{pathMessage}</small></div>
    {rows.length ? <div className="issue-list">
      {openRows.map((row) => <div className="issue-row" key={row.key}>
        <span className="issue-text">{row.text}</span>
        <span className="issue-actions"><button type="button" onClick={() => onConfirm(row.key)}>确认</button><button type="button" onClick={() => onIgnore(row.key)}>忽略</button></span>
      </div>)}
      {resolvedRows.map((row) => <div className="issue-row is-resolved" key={row.key}>
        <span className="issue-text">{row.text}</span>
        <span className="issue-actions"><em>{resolutions[row.key] === 'confirmed' ? '已确认' : '已忽略'}</em><button type="button" onClick={() => onRestore(row.key)}>撤销</button></span>
      </div>)}
    </div> : null}
  </section>;
}
