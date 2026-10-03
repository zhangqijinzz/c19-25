import { describe, expect, it, vi } from 'vitest';
import { createStarterDocument, DEFAULT_RULE_SET } from '../src/domain';
import { normalizeDocument, type LayoutRepository } from '../src/repository';
import type { LayoutDocument } from '../src/types';
import { ExpoSketchViewModel } from '../src/viewModel';

const fakeRepository = (initial: LayoutDocument | null = null): LayoutRepository => ({
  load: vi.fn(async () => normalizeDocument(initial ?? createStarterDocument())),
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

  it('toggles a rule category on and off and persists it with the document', async () => {
    const repository = fakeRepository();
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    const channelCount = vm.state.analysis.channels.length;
    expect(channelCount).toBeGreaterThan(0);
    vm.setRuleEnabled('channel', false);
    expect(vm.state.analysis.channels).toHaveLength(0);
    expect(vm.state.document.ruleSet?.enabledRules.channel).toBe(false);
    vm.setRuleEnabled('channel', true);
    expect(vm.state.analysis.channels).toHaveLength(channelCount);
  });

  it('reopens previously ignored/confirmed conclusions after the threshold changes', async () => {
    const repository = fakeRepository();
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    const issueKey = vm.state.analysis.channels[0].key;
    vm.resolveIssue(issueKey, 'ignored');
    expect(vm.state.issueStatuses[issueKey]).toBe('ignored');
    expect(vm.state.pendingCount).toBeLessThan(vm.state.analysis.channels.length + vm.state.analysis.overlaps.length + vm.state.analysis.bounds.length);

    // 换一个更严的主办方标准：旧签名失效，结论必须回到待处理
    vm.setRuleThreshold('minChannelWidth', DEFAULT_RULE_SET.minChannelWidth + 1);
    expect(vm.state.document.issueResolutions?.[issueKey]).toBeUndefined();
    expect(vm.state.issueStatuses[issueKey]).toBeUndefined();
  });

  it('drops resolutions for issues that are fixed by moving elements', async () => {
    const repository = fakeRepository();
    const vm = new ExpoSketchViewModel(repository);
    await vm.initialize();
    const issue = vm.state.analysis.channels[0];
    vm.resolveIssue(issue.key, 'confirmed');
    // 把其中一个元素挪到远处，问题消失，历史结论随之清除
    const target = issue.firstId === 'stage-1' || issue.secondId === 'stage-1' ? (issue.firstId === 'stage-1' ? issue.firstId : issue.secondId) : issue.firstId;
    vm.moveElement(target, 15, 13);
    expect(vm.state.document.issueResolutions?.[issue.key]).toBeUndefined();
  });

  it('allows clearing a resolution back to pending', async () => {
    const vm = new ExpoSketchViewModel(fakeRepository());
    await vm.initialize();
    const issueKey = vm.state.analysis.channels[0].key;
    vm.resolveIssue(issueKey, 'confirmed');
    vm.clearIssueStatus(issueKey);
    expect(vm.state.issueStatuses[issueKey]).toBeUndefined();
  });

  it('opens a legacy document without ruleSet with defaults and no false positives', async () => {
    const legacy = { version: 1, title: '旧方案', field: { width: 20, height: 12 }, elements: [{ id: 'a', kind: 'booth', name: 'a', x: 0.3, y: 0.3, width: 4, height: 3, rotation: 0 }] } as LayoutDocument;
    const vm = new ExpoSketchViewModel(fakeRepository(legacy));
    await vm.initialize();
    expect(vm.state.document.ruleSet).toEqual(DEFAULT_RULE_SET);
    expect(vm.state.analysis.bounds).toHaveLength(0);
    expect(vm.state.analysis.spacing).toHaveLength(0);
  });
});
