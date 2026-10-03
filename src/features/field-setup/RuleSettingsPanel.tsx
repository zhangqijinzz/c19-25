import type { RuleId, RuleSet } from '../../types';

interface RuleSettingsPanelProps {
  ruleSet: RuleSet;
  onRuleEnabledChange: (ruleId: RuleId, enabled: boolean) => void;
  onThresholdChange: (key: 'minChannelWidth' | 'edgeSetback' | 'minElementSpacing', value: number) => void;
}

type ThresholdKey = 'minChannelWidth' | 'edgeSetback' | 'minElementSpacing';

interface RuleRow {
  ruleId: RuleId;
  label: string;
  description: string;
  thresholdKey?: ThresholdKey;
  thresholdLabel?: string;
}

const RULE_ROWS: RuleRow[] = [
  { ruleId: 'overlap', label: '元素重叠', description: '元素占地范围互相交叠' },
  { ruleId: 'bounds', label: '边界退让', description: '元素到场地边界的最小净距', thresholdKey: 'edgeSetback', thresholdLabel: '退让距离' },
  { ruleId: 'channel', label: '最小通道', description: '正对元素之间的通行宽度', thresholdKey: 'minChannelWidth', thresholdLabel: '通道宽度' },
  { ruleId: 'spacing', label: '元素间距', description: '任意两个元素之间的最小净距（含斜向）', thresholdKey: 'minElementSpacing', thresholdLabel: '最小间距' },
];

function ThresholdInput({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  const commit = (event: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
    const next = Number(event.currentTarget.value);
    if (Number.isFinite(next) && next >= 0) onChange(next);
    else event.currentTarget.value = String(value);
  };
  return <label className="rule-threshold">
    <span>{label}</span>
    <input
      type="number"
      min="0"
      step="0.1"
      defaultValue={value}
      key={value}
      disabled={disabled}
      aria-label={label}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    />
    <em>m</em>
  </label>;
}

export function RuleSettingsPanel({ ruleSet, onRuleEnabledChange, onThresholdChange }: RuleSettingsPanelProps) {
  return <section className="panel rule-settings">
    <div className="panel-heading"><div><span className="section-kicker">RULE SET</span><h2>检查规则集</h2></div></div>
    <p className="panel-hint">规则随本方案一起保存，调整阈值后历史确认 / 忽略结论会立即重算。</p>
    <div className="rule-list">
      {RULE_ROWS.map((row) => {
        const enabled = ruleSet.enabledRules[row.ruleId];
        return <div className={`rule-row ${enabled ? 'is-enabled' : 'is-disabled'}`} key={row.ruleId}>
          <label className="rule-toggle">
            <input type="checkbox" checked={enabled} onChange={(event) => onRuleEnabledChange(row.ruleId, event.target.checked)} />
            <span className="rule-switch" aria-hidden="true" />
            <span className="rule-copy"><strong>{row.label}</strong><small>{row.description}</small></span>
          </label>
          {row.thresholdKey ? <ThresholdInput label={row.thresholdLabel!} value={ruleSet[row.thresholdKey]} disabled={!enabled} onChange={(value) => onThresholdChange(row.thresholdKey!, value)} /> : null}
        </div>;
      })}
    </div>
  </section>;
}
