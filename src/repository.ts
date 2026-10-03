import { createStarterDocument, normalizeRuleSet } from './domain';
import type { DocumentStorageService } from './storageService';
import type { IssueResolution, LayoutDocument, RuleId } from './types';

export interface LayoutRepository {
  load(): Promise<LayoutDocument>;
  save(document: LayoutDocument): Promise<void>;
}

const isElement = (value: unknown): value is LayoutDocument['elements'][number] => {
  if (!value || typeof value !== 'object') return false;
  const element = value as Record<string, unknown>;
  return typeof element.id === 'string' && typeof element.kind === 'string' && typeof element.x === 'number' && typeof element.y === 'number' && typeof element.width === 'number' && typeof element.height === 'number' && typeof element.rotation === 'number';
};

const RULE_IDS: RuleId[] = ['overlap', 'bounds', 'channel', 'spacing'];

const isIssueResolution = (value: unknown): value is IssueResolution => {
  if (!value || typeof value !== 'object') return false;
  const resolution = value as Record<string, unknown>;
  return (resolution.status === 'confirmed' || resolution.status === 'ignored')
    && typeof resolution.ruleId === 'string' && RULE_IDS.includes(resolution.ruleId as RuleId)
    && typeof resolution.signature === 'string';
};

const normalizeResolutions = (value: unknown): Record<string, IssueResolution> => {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, resolution]) => isIssueResolution(resolution)) as Array<[string, IssueResolution]>);
};

const isDocument = (value: unknown): value is LayoutDocument => {
  if (!value || typeof value !== 'object') return false;
  const document = value as Record<string, unknown>;
  const field = document.field as Record<string, unknown> | undefined;
  return document.version === 1 && typeof document.title === 'string' && !!field && typeof field.width === 'number' && typeof field.height === 'number' && Array.isArray(document.elements) && document.elements.every(isElement);
};

/**
 * 归一化读取到的方案：老方案没有 ruleSet 时用默认值补齐，
 * 保证缺少配置也按同一套合理标准打开，而不是报错或误判。
 */
export const normalizeDocument = (saved: LayoutDocument): LayoutDocument => ({
  ...saved,
  ruleSet: normalizeRuleSet(saved.ruleSet),
  issueResolutions: normalizeResolutions(saved.issueResolutions),
});

export class LocalLayoutRepository implements LayoutRepository {
  constructor(private readonly storage: DocumentStorageService) {}

  async load(): Promise<LayoutDocument> {
    try {
      const saved = await this.storage.read();
      return saved && isDocument(saved) ? normalizeDocument(saved) : createStarterDocument();
    } catch {
      return createStarterDocument();
    }
  }

  async save(document: LayoutDocument): Promise<void> {
    await this.storage.write(document);
  }
}
