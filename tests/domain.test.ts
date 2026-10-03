import { describe, expect, it } from 'vitest';
import { analyzeLayout, createDefaultRuleSet, filterOpenIssues, findBoundsIssues, findNarrowChannels, findOverlaps, findSetbackIssues, findSpacingIssues, issueKey, normalizeRuleSet } from '../src/domain';
import type { ExpoElement, LayoutDocument } from '../src/types';

const item = (id: string, x: number, y: number, width = 4, height = 3): ExpoElement => ({ id, kind: 'booth', name: id, x, y, width, height, rotation: 0 });

const docWith = (elements: ExpoElement[], extra: Partial<LayoutDocument> = {}): LayoutDocument => ({ version: 1, title: 'x', field: { width: 20, height: 12 }, elements, ...extra });

describe('layout domain rules', () => {
  it('detects overlap area between two elements', () => {
    expect(findOverlaps([item('a', 1, 1), item('b', 3, 2)])).toEqual([{ firstId: 'a', secondId: 'b', amount: 4 }]);
  });

  it('detects field overflow and rotated bounds', () => {
    const rotated = { ...item('rotated', 8, 2, 2, 5), rotation: 90 };
    expect(findBoundsIssues({ width: 10, height: 10 }, [rotated])).toEqual([{ elementId: 'rotated', overflow: 3 }]);
  });

  it('flags a pass narrower than the minimum channel', () => {
    expect(findNarrowChannels([item('a', 1, 1), item('b', 5.5, 1)])).toEqual([{ firstId: 'a', secondId: 'b', gap: 0.5 }]);
  });

  it('uses the configured channel threshold', () => {
    const elements = [item('a', 1, 1), item('b', 6.5, 1)];
    expect(findNarrowChannels(elements, 1.2)).toEqual([]);
    expect(findNarrowChannels(elements, 2)).toEqual([{ firstId: 'a', secondId: 'b', gap: 1.5 }]);
  });

  it('flags elements closer to the boundary than the setback', () => {
    expect(findSetbackIssues({ width: 20, height: 12 }, [item('a', 0.2, 5), item('b', 8, 5)], 0.5)).toEqual([{ elementId: 'a', clearance: 0.2 }]);
    expect(findSetbackIssues({ width: 20, height: 12 }, [item('a', 0.2, 5)], 0)).toEqual([]);
  });

  it('flags pairs closer than the minimum spacing, including diagonals', () => {
    expect(findSpacingIssues([item('a', 1, 1), item('b', 5.4, 1)], 0.8)).toEqual([{ firstId: 'a', secondId: 'b', gap: 0.4 }]);
    expect(findSpacingIssues([item('a', 1, 1), item('b', 8, 1)], 0.8)).toEqual([]);
    expect(findSpacingIssues([item('a', 1, 1), item('b', 3, 2)], 0.8)).toEqual([]);
  });

  it('returns a path when entrance and focus area exist', () => {
    const analysis = analyzeLayout(docWith([{ ...item('entry', 1, 5, 2, 1), kind: 'entrance' }, { ...item('stage', 10, 2, 5, 3), kind: 'stage' }]));
    expect(analysis.path?.points).toHaveLength(3);
    expect(analysis.path?.distance).toBeGreaterThan(0);
  });

  it('falls back to default rules when the document has none', () => {
    const analysis = analyzeLayout(docWith([item('a', 1, 1), item('b', 5.5, 1)]));
    expect(analysis.channels).toEqual([{ firstId: 'a', secondId: 'b', gap: 0.5 }]);
    expect(analysis.setbacks).toEqual([]);
    expect(analysis.spacings).toEqual([]);
  });

  it('respects rule toggles and thresholds from the document', () => {
    const rules = createDefaultRuleSet();
    rules.checks.channel = false;
    rules.checks.setback = true;
    const analysis = analyzeLayout(docWith([item('a', 0.2, 1), item('b', 5.5, 1)], { rules }));
    expect(analysis.channels).toEqual([]);
    expect(analysis.setbacks).toEqual([{ elementId: 'a', clearance: 0.2 }]);
  });

  it('normalizes partial or invalid rule sets to safe defaults', () => {
    expect(normalizeRuleSet(undefined)).toEqual(createDefaultRuleSet());
    expect(normalizeRuleSet({ minChannel: 99 }).minChannel).toBe(10);
    expect(normalizeRuleSet({ minChannel: -3 }).minChannel).toBe(0);
    expect(normalizeRuleSet({ minChannel: Number.NaN }).minChannel).toBe(1.2);
    const partial = normalizeRuleSet({ checks: { channel: false, spacing: 'yes' } });
    expect(partial.checks.channel).toBe(false);
    expect(partial.checks.spacing).toBe(false);
    expect(partial.checks.overlap).toBe(true);
  });

  it('filters confirmed and ignored issues out of the open list', () => {
    const analysis = analyzeLayout(docWith([item('a', 1, 1), item('b', 3, 2)]));
    const key = issueKey('overlap', 'a', 'b');
    expect(analysis.overlaps).toHaveLength(1);
    expect(filterOpenIssues(analysis, { [key]: 'confirmed' }).overlaps).toEqual([]);
    expect(filterOpenIssues(analysis, { [key]: 'ignored' }).overlaps).toEqual([]);
    expect(filterOpenIssues(analysis, {}).overlaps).toHaveLength(1);
  });
});
