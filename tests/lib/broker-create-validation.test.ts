import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/create/route.ts'), 'utf8');

describe('broker create input normalization', () => {
  it('normalizes optional strings and validates URL fields before insert', () => {
    const helperIndex = route.indexOf('function optionalTrimmedString(value: unknown, maxLength: number)');
    const urlHelperIndex = route.indexOf('function optionalHttpUrl(value: unknown, fieldName: string)', helperIndex);
    const urlPatternIndex = route.indexOf('http:// or https://', urlHelperIndex);
    const normalizedLogoIndex = route.indexOf('const normalizedLogoUrl = optionalHttpUrl(logoUrl', urlPatternIndex);
    const normalizedWebsiteIndex = route.indexOf('const normalizedWebsiteUrl = optionalHttpUrl(websiteUrl', normalizedLogoIndex);
    const insertIndex = route.indexOf(".from('Brokerage')", normalizedWebsiteIndex);
    const logoInsertIndex = route.indexOf('normalizedLogoUrl.value', insertIndex);
    const rawStringCoerceIndex = route.indexOf('String(logoUrl)', insertIndex);

    expect(helperIndex).toBeGreaterThan(-1);
    expect(urlHelperIndex).toBeGreaterThan(helperIndex);
    expect(urlPatternIndex).toBeGreaterThan(urlHelperIndex);
    expect(normalizedLogoIndex).toBeGreaterThan(urlPatternIndex);
    expect(normalizedWebsiteIndex).toBeGreaterThan(normalizedLogoIndex);
    expect(logoInsertIndex).toBeGreaterThan(insertIndex);
    expect(rawStringCoerceIndex).toBe(-1);
  });
});
