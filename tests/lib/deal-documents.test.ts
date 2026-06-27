/**
 * The deal-document helpers back the upload dialog + doc rows: which kind is
 * pre-selected per pipeline, the kind list shown (and its lead-with ordering),
 * the kind guard the API trusts, the human label, and the file-size formatter.
 * Pin them — the kind list is the single source of truth the dropdown renders,
 * and formatFileSize's unit-step + precision rules are easy to nudge.
 */

import { describe, it, expect } from 'vitest';
import {
  defaultDocumentKind,
  documentKindsForPipeline,
  isValidDocumentKind,
  documentKindLabel,
  formatFileSize,
  DEAL_DOCUMENT_KINDS,
} from '@/lib/deals/documents';

describe('defaultDocumentKind', () => {
  it('pre-selects per pipeline type, offer as the fallback', () => {
    expect(defaultDocumentKind('seller')).toBe('listing_agreement');
    expect(defaultDocumentKind('rental')).toBe('lease_agreement');
    expect(defaultDocumentKind('buyer')).toBe('offer');
    expect(defaultDocumentKind(null)).toBe('offer');
    expect(defaultDocumentKind(undefined)).toBe('offer');
  });
});

describe('documentKindsForPipeline', () => {
  it('leads with the pipeline-relevant kind and only lists valid kinds', () => {
    expect(documentKindsForPipeline('seller')[0]).toBe('listing_agreement');
    expect(documentKindsForPipeline('rental')[0]).toBe('lease_agreement');
    expect(documentKindsForPipeline('buyer')[0]).toBe('offer');
    for (const list of [documentKindsForPipeline('seller'), documentKindsForPipeline('rental'), documentKindsForPipeline(null)]) {
      expect(list.every(isValidDocumentKind)).toBe(true);
      expect(new Set(list).size).toBe(list.length); // no dupes
      expect(list).toContain('other'); // escape hatch always present
    }
  });
});

describe('isValidDocumentKind / documentKindLabel', () => {
  it('accepts every catalog value and rejects junk', () => {
    for (const k of DEAL_DOCUMENT_KINDS) expect(isValidDocumentKind(k.value)).toBe(true);
    expect(isValidDocumentKind('mortgage')).toBe(false);
    expect(isValidDocumentKind(null)).toBe(false);
    expect(isValidDocumentKind(42)).toBe(false);
  });

  it('maps a kind to its catalog label', () => {
    expect(documentKindLabel('purchase_agreement')).toBe('Purchase agreement');
    expect(documentKindLabel('other')).toBe('Other');
  });
});

describe('formatFileSize', () => {
  it('returns empty for missing / non-positive sizes', () => {
    expect(formatFileSize(null)).toBe('');
    expect(formatFileSize(undefined)).toBe('');
    expect(formatFileSize(0)).toBe('');
    expect(formatFileSize(-5)).toBe('');
  });

  it('steps units and applies the precision rule', () => {
    expect(formatFileSize(512)).toBe('512 B'); // bytes: no decimal
    expect(formatFileSize(1536)).toBe('1.5 KB'); // 1536/1024 = 1.5
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB'); // <100 and not bytes -> 1 decimal place
    expect(formatFileSize(150 * 1024 * 1024)).toBe('150 MB'); // >=100 -> no decimal
  });
});
