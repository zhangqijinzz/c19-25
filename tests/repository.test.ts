import { describe, expect, it } from 'vitest';
import { createStarterDocument, DEFAULT_RULE_SET } from '../src/domain';
import { LocalLayoutRepository, normalizeDocument } from '../src/repository';
import { BrowserStorageService } from '../src/storageService';
import type { LayoutDocument } from '../src/types';

describe('LocalLayoutRepository', () => {
  it('falls back to the starter document when persisted JSON is damaged', async () => {
    window.localStorage.setItem('exposketch.document.v1', '{broken-json');
    const repository = new LocalLayoutRepository(new BrowserStorageService());
    expect(await repository.load()).toEqual(createStarterDocument());
    window.localStorage.clear();
  });

  it('opens legacy documents without ruleSet using safe defaults', async () => {
    const legacy = { version: 1, title: '旧方案', field: { width: 20, height: 12 }, elements: [] };
    window.localStorage.setItem('exposketch.document.v1', JSON.stringify(legacy));
    const loaded = await new LocalLayoutRepository(new BrowserStorageService()).load();
    expect(loaded.ruleSet).toEqual(DEFAULT_RULE_SET);
    expect(loaded.issueResolutions).toEqual({});
    window.localStorage.clear();
  });

  it('keeps a valid configured rule set as saved with the project', async () => {
    const document = createStarterDocument();
    document.ruleSet = { ...DEFAULT_RULE_SET, edgeSetback: 2, enabledRules: { ...DEFAULT_RULE_SET.enabledRules, spacing: true } };
    const repository = new LocalLayoutRepository(new BrowserStorageService());
    await repository.save(document);
    const loaded = await repository.load();
    expect(loaded.ruleSet?.edgeSetback).toBe(2);
    expect(loaded.ruleSet?.enabledRules.spacing).toBe(true);
    window.localStorage.clear();
  });

  it('normalizes broken thresholds instead of rejecting the layout', () => {
    const legacy = { version: 1, title: 'x', field: { width: 20, height: 12 }, elements: [], ruleSet: { minChannelWidth: 'wide', edgeSetback: -5, enabledRules: { overlap: 'nope' } } };
    const normalized = normalizeDocument(legacy as never);
    expect(normalized.ruleSet!.minChannelWidth).toBe(DEFAULT_RULE_SET.minChannelWidth);
    expect(normalized.ruleSet!.edgeSetback).toBe(DEFAULT_RULE_SET.edgeSetback);
    expect(normalized.ruleSet!.enabledRules.overlap).toBe(true);
  });

  it('drops structurally invalid resolutions while keeping valid ones', () => {
    const document = createStarterDocument();
    const withResolutions = {
      ...document,
      issueResolutions: {
        'channel:a|b': { status: 'ignored' as const, ruleId: 'channel' as const, signature: 'channel:1.2:0.8' },
        'bounds:x': { status: 'maybe' as const, ruleId: 'bounds' as const, signature: 'bounds:0:0.5' },
      },
    };
    const normalized = normalizeDocument(withResolutions as unknown as LayoutDocument);
    expect(Object.keys(normalized.issueResolutions!)).toEqual(['channel:a|b']);
  });
});
