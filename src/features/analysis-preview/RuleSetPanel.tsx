import type { CheckCategory, RuleSet } from '../../types';
import type { RuleThresholdKey } from '../../viewModel';

interface RuleSetPanelProps {
  rules: RuleSet;
  onToggleCheck: (category: CheckCategory) => void;
  onThresholdChange: (key: RuleThresholdKey, value: number) => void;
  onReset: () => void;
}

const CHECK_ITEMS: Array<{ category: CheckCategory; label: string; hint: string }> = [
  { category: 'overlap', label: '元素重叠', hint: '元素之间不能互相压占' },
  { category: 'bounds', label: '场地越界', hint: '元素不能超出场地边界' },
  { category: 'channel', label: '通道宽度', hint: '并排元素之间的通行净宽' },
  { category: 'setback', label: '边界退让', hint: '元素到场地边界的最小距离' },
  { category: 'spacing', label: '元素间距', hint: '任意两个元素的最小间距' },
];

const THRESHOLD_ITEMS: Array<{ key: RuleThresholdKey; category: CheckCategory; label: string }> = [
  { key: 'minChannel', category: 'channel', label: '最小通道 (m)' },
  { key: 'boundarySetback', category: 'setback', label: '边界退让 (m)' },
  { key: 'minSpacing', category: 'spacing', label: '最小间距 (m)' },
];

export function RuleSetPanel({ rules, onToggleCheck, onThresholdChange, onReset }: RuleSetPanelProps) {
  return <section className="panel rules-panel">
    <div className="panel-heading"><div><span className="section-kicker">RULE SET</span><h2>检查规则</h2></div></div>
    <p className="panel-hint">按主办方要求开关检查项、调整阈值，修改后历史结论会按新标准重新计算。</p>
    <div className="rule-list">
      {CHECK_ITEMS.map((item) => <label className="rule-toggle" key={item.category}>
        <input type="checkbox" checked={rules.checks[item.category]} onChange={() => onToggleCheck(item.category)} />
        <span><strong>{item.label}</strong><small>{item.hint}</small></span>
      </label>)}
    </div>
    <div className="rule-thresholds">
      {THRESHOLD_ITEMS.map((item) => {
        const enabled = rules.checks[item.category];
        return <label key={item.key} className={enabled ? '' : 'is-disabled'}>{item.label}
          <input type="number" min="0" max="10" step="0.1" disabled={!enabled} aria-label={item.label}
            key={`${item.key}-${rules[item.key]}`} defaultValue={rules[item.key]}
            onBlur={(event) => onThresholdChange(item.key, Number(event.target.value))}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        </label>;
      })}
    </div>
    <button type="button" className="text-button" onClick={onReset}>↺ 恢复默认规则</button>
  </section>;
}
