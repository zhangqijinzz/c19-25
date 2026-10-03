import { describe, expect, it } from 'vitest';
import { createDefaultRuleSet, createStarterDocument } from '../src/domain';
import { LocalLayoutRepository } from '../src/repository';
import { BrowserStorageService } from '../src/storageService';

describe('LocalLayoutRepository', () => {
  it('falls back to the starter document when persisted JSON is damaged', async () => {
    window.localStorage.setItem('exposketch.document.v1', '{broken-json');
    const repository = new LocalLayoutRepository(new BrowserStorageService());
    expect(await repository.load()).toEqual(createStarterDocument());
    window.localStorage.clear();
  });

  it('opens legacy documents without a rule set using safe defaults', async () => {
    const legacy = {
      version: 1,
      title: '老方案',
      field: { width: 20, height: 12 },
      elements: [{ id: 'a', kind: 'booth', name: '展位', x: 0.2, y: 1, width: 4, height: 3, rotation: 0 }],
    };
    window.localStorage.setItem('exposketch.document.v1', JSON.stringify(legacy));
    const repository = new LocalLayoutRepository(new BrowserStorageService());
    const loaded = await repository.load();
    expect(loaded.rules).toEqual(createDefaultRuleSet());
    expect(loaded.resolutions).toEqual({});
    window.localStorage.clear();
  });

  it('keeps a persisted rule set and drops invalid resolution entries', async () => {
    const saved = {
      ...createStarterDocument(),
      rules: { checks: { overlap: true, bounds: false, channel: true, setback: true, spacing: false }, minChannel: 2, boundarySetback: 1, minSpacing: 0.6 },
      resolutions: { 'overlap:a|b': 'confirmed', 'channel:a|b': 'sometimes' },
    };
    window.localStorage.setItem('exposketch.document.v1', JSON.stringify(saved));
    const repository = new LocalLayoutRepository(new BrowserStorageService());
    const loaded = await repository.load();
    expect(loaded.rules?.minChannel).toBe(2);
    expect(loaded.rules?.checks.setback).toBe(true);
    expect(loaded.resolutions).toEqual({ 'overlap:a|b': 'confirmed' });
    window.localStorage.clear();
  });
});
