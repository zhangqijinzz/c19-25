import { describe, expect, it } from 'vitest';
import { analyzeLayout, DEFAULT_RULE_SET, findBoundsIssues, findNarrowChannels, findOverlaps, findSpacingIssues, normalizeRuleSet, reconcileResolutions } from '../src/domain';
import type { Analysis, ExpoElement, RuleSet } from '../src/types';

const item = (id: string, x: number, y: number, width = 4, height = 3): ExpoElement => ({ id, kind: 'booth', name: id, x, y, width, height, rotation: 0 });

const docWith = (elements: ExpoElement[], field = { width: 20, height: 12 }, ruleSet?: RuleSet) => ({
  version: 1 as const, title: 'x', field, elements, ruleSet: ruleSet ?? DEFAULT_RULE_SET, issueResolutions: {},
});

describe('layout domain rules', () => {
  it('detects overlap area between two elements', () => {
    const [issue] = findOverlaps([item('a', 1, 1), item('b', 3, 2)]);
    expect(issue).toMatchObject({ firstId: 'a', secondId: 'b', amount: 4 });
    expect(issue.key).toBe('overlap:a|b');
  });

  it('detects field overflow and rotated bounds', () => {
    const rotated = { ...item('rotated', 8, 2, 2, 5), rotation: 90 };
    expect(findBoundsIssues({ width: 10, height: 10 }, [rotated], 0)).toEqual([expect.objectContaining({ elementId: 'rotated', shortfall: 3 })]);
  });

  it('treats edge setback 0 as pure overflow check (old behavior)', () => {
    const inside = item('inside', 1, 1);
    expect(findBoundsIssues({ width: 10, height: 10 }, [inside], 0)).toHaveLength(0);
  });

  it('flags elements closer to the edge than the configured setback', () => {
    const issues = findBoundsIssues({ width: 10, height: 10 }, [item('a', 1, 1)], 1.5);
    expect(issues).toEqual([expect.objectContaining({ elementId: 'a', shortfall: 0.5 })]);
  });

  it('flags a pass narrower than the configured minimum channel', () => {
    const [issue] = findNarrowChannels([item('a', 1, 1), item('b', 5.5, 1)], 1.2);
    expect(issue).toMatchObject({ firstId: 'a', secondId: 'b', gap: 0.5 });
  });

  it('does not flag the same gap once the threshold drops below it', () => {
    expect(findNarrowChannels([item('a', 1, 1), item('b', 5.5, 1)], 0.4)).toHaveLength(0);
  });

  it('measures diagonal clearances for the spacing rule', () => {
    // 两矩形在 x、y 上都错开 0.5，属于斜角相邻，通道检查不覆盖，净距检查覆盖
    const issues = findSpacingIssues([item('a', 1, 1), item('b', 5.5, 4.5)], 1);
    expect(issues).toEqual([expect.objectContaining({ firstId: 'a', secondId: 'b', distance: 0.7 })]);
  });

  it('skips spacing for overlapping elements', () => {
    expect(findSpacingIssues([item('a', 1, 1), item('b', 3, 2)], 1)).toHaveLength(0);
  });

  it('returns a path when entrance and focus area exist', () => {
    const analysis = analyzeLayout(docWith([{ ...item('entry', 1, 5, 2, 1), kind: 'entrance' }, { ...item('stage', 10, 2, 5, 3), kind: 'stage' }]));
    expect(analysis.path?.points).toHaveLength(3);
    expect(analysis.path?.distance).toBeGreaterThan(0);
  });

  it('returns empty result sets for disabled rule categories', () => {
    const ruleSet: RuleSet = { enabledRules: { overlap: false, bounds: false, channel: false, spacing: false }, minChannelWidth: 1.2, edgeSetback: 0, minElementSpacing: 1 };
    const analysis = analyzeLayout(docWith([item('a', 1, 1), item('b', 3, 2)], { width: 6, height: 6 }, ruleSet));
    expect(analysis).toMatchObject({ overlaps: [], bounds: [], channels: [], spacing: [] });
  });
});

describe('rule set normalization', () => {
  it('falls back to the default standards for missing or broken config', () => {
    expect(normalizeRuleSet(undefined)).toEqual(DEFAULT_RULE_SET);
    expect(normalizeRuleSet(null)).toEqual(DEFAULT_RULE_SET);
    expect(normalizeRuleSet({})).toEqual(DEFAULT_RULE_SET);
  });

  it('repairs invalid thresholds and keeps valid toggles', () => {
    const normalized = normalizeRuleSet({ minChannelWidth: -3, edgeSetback: 2, enabledRules: { overlap: true, bounds: true, channel: true, spacing: true } });
    expect(normalized.minChannelWidth).toBe(DEFAULT_RULE_SET.minChannelWidth);
    expect(normalized.edgeSetback).toBe(2);
    expect(normalized.enabledRules.spacing).toBe(true);
    expect(normalized.enabledRules.overlap).toBe(true);
  });

  it('opens legacy documents with defaults that do not invent new issues', () => {
    // 旧方案无 ruleSet：默认退让 0、间距检查关闭，布局结果与旧标准一致
    const analysis = analyzeLayout(docWith([item('a', 0.2, 0.2), item('b', 10, 5)]));
    expect(analysis.bounds).toHaveLength(0);
    expect(analysis.spacing).toHaveLength(0);
  });
});

describe('resolution reconciliation', () => {
  const analysisFor = (ruleSet: RuleSet): Analysis => analyzeLayout(docWith([item('a', 1, 1), item('b', 5.5, 1)], undefined, ruleSet));

  it('keeps resolutions whose signature still matches', () => {
    const ruleSet = DEFAULT_RULE_SET;
    const analysis = analysisFor(ruleSet);
    const issue = analysis.channels[0];
    const resolutions = { [issue.key]: { status: 'ignored' as const, ruleId: issue.ruleId, signature: issue.signature } };
    expect(reconcileResolutions(analysis, resolutions)).toEqual(resolutions);
  });

  it('drops resolutions after the threshold changes so issues re-open', () => {
    const issue = analysisFor(DEFAULT_RULE_SET).channels[0];
    const stale = { [issue.key]: { status: 'confirmed' as const, ruleId: issue.ruleId, signature: issue.signature } };
    const widened: RuleSet = { ...DEFAULT_RULE_SET, minChannelWidth: 2 };
    expect(reconcileResolutions(analysisFor(widened), stale)).toEqual({});
  });

  it('drops resolutions for issues that disappeared', () => {
    const issue = analysisFor(DEFAULT_RULE_SET).channels[0];
    const stale = { [issue.key]: { status: 'ignored' as const, ruleId: issue.ruleId, signature: issue.signature } };
    const cleared: RuleSet = { ...DEFAULT_RULE_SET, minChannelWidth: 0.4 };
    expect(reconcileResolutions(analysisFor(cleared), stale)).toEqual({});
  });

  it('drops malformed-looking resolutions whose rule id no longer matches', () => {
    const analysis = analysisFor(DEFAULT_RULE_SET);
    const issue = analysis.channels[0];
    const tampered = { [issue.key]: { status: 'ignored' as const, ruleId: 'overlap' as const, signature: issue.signature } };
    expect(reconcileResolutions(analysis, tampered)).toEqual({});
  });
});
