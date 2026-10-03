import { describe, expect, it, vi } from 'vitest';
import { createStarterDocument, issueKey } from '../src/domain';
import type { LayoutRepository } from '../src/repository';
import type { LayoutDocument } from '../src/types';
import { ExpoSketchViewModel } from '../src/viewModel';

const fakeRepository = (initial: LayoutDocument | null = null): LayoutRepository => ({
  load: vi.fn(async () => initial ?? createStarterDocument()),
  save: vi.fn(async (_document) => {}),
});

describe('ExpoSketchViewModel', () => {
  it('initializes and updates the selected layout', async () => {
    const repository = fakeRepository();
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('ready');
    const count = vm.state.document.elements.length;
    vm.addElement('booth');
    expect(vm.state.document.elements).toHaveLength(count + 1);
    expect(vm.state.selectedId).toContain('booth-');
  });

  it('updates analysis immediately after moving an element into an overlap', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.moveElement('stage-1', 4.5, 2.5);
    expect(vm.state.analysis.overlaps.length).toBeGreaterThan(0);
  });

  it('recovers the example if repository loading fails', async () => {
    const repository: LayoutRepository = { load: vi.fn(async () => { throw new Error('bad storage'); }), save: vi.fn(async () => {}) };
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    expect(vm.state.phase).toBe('error');
    expect(vm.state.document.title).toContain('春日创意市集');
  });

  it('shows a save error without dropping the working document', async () => {
    const repository: LayoutRepository = { load: vi.fn(async () => createStarterDocument()), save: vi.fn(async () => { throw new Error('quota'); }) };
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    vm.addElement('stage');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vm.state.document.elements.some((element) => element.kind === 'stage' && element.id.startsWith('stage-'))).toBe(true);
    expect(vm.state.notice.tone).toBe('error');
  });

  it('ignores invalid dimensions instead of corrupting the working selection', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    const before = vm.state.document.elements[0].width;
    vm.resizeSelected(0, 0);
    expect(vm.state.document.elements[0].width).toBe(before);
  });

  it('confirms and ignores issues without dropping them from the full analysis', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.moveElement('stage-1', 4.5, 2.5);
    const issue = vm.state.analysis.overlaps[0];
    const key = issueKey('overlap', issue.firstId, issue.secondId);
    vm.confirmIssue(key);
    expect(vm.state.openAnalysis.overlaps).toHaveLength(0);
    expect(vm.state.analysis.overlaps.length).toBeGreaterThan(0);
    vm.restoreIssue(key);
    expect(vm.state.openAnalysis.overlaps.length).toBeGreaterThan(0);
    vm.ignoreIssue(key);
    expect(vm.state.openAnalysis.overlaps).toHaveLength(0);
  });

  it('recomputes conclusions and clears resolutions when thresholds change', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.moveElement('stage-1', 4.5, 2.5);
    const issue = vm.state.analysis.overlaps[0];
    vm.confirmIssue(issueKey('overlap', issue.firstId, issue.secondId));
    expect(vm.state.openAnalysis.overlaps).toHaveLength(0);
    vm.updateRuleThreshold('minChannel', 2);
    expect(vm.state.document.resolutions).toEqual({});
    expect(vm.state.document.rules?.minChannel).toBe(2);
    expect(vm.state.openAnalysis.overlaps.length).toBeGreaterThan(0);
  });

  it('clears resolutions when a check category is toggled', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.moveElement('stage-1', 4.5, 2.5);
    const issue = vm.state.analysis.overlaps[0];
    vm.ignoreIssue(issueKey('overlap', issue.firstId, issue.secondId));
    vm.toggleCheck('overlap');
    expect(vm.state.analysis.overlaps).toEqual([]);
    expect(vm.state.document.resolutions).toEqual({});
    vm.toggleCheck('overlap');
    expect(vm.state.analysis.overlaps.length).toBeGreaterThan(0);
  });

  it('rejects invalid threshold values', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.updateRuleThreshold('minChannel', -1);
    vm.updateRuleThreshold('minChannel', Number.NaN);
    expect(vm.state.document.rules?.minChannel).toBe(1.2);
  });

  it('restores default rules and recomputes conclusions', () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    vm.updateRuleThreshold('minChannel', 3);
    vm.toggleCheck('setback');
    vm.resetRules();
    expect(vm.state.document.rules?.minChannel).toBe(1.2);
    expect(vm.state.document.rules?.checks.setback).toBe(false);
  });
});
