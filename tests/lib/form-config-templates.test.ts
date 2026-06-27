/**
 * The built-in form templates are what a realtor starts a custom form from. Each
 * one MUST pass the same formConfigSchema gate getFormConfig* applies, or the
 * builder would offer a template it then refuses to load. Pin that every
 * template validates, that they carry their declared leadType, and that the
 * FORM_TEMPLATES registry is well-formed (unique ids, each entry wired to a real
 * config). This catches a hand-edited template drifting out of schema.
 */

import { describe, it, expect } from 'vitest';
import { formConfigSchema } from '@/lib/form-config-schema';
import {
  RENTAL_APPLICATION_TEMPLATE,
  BUYER_INQUIRY_TEMPLATE,
  GENERAL_LEAD_CAPTURE_TEMPLATE,
  FORM_TEMPLATES,
} from '@/lib/form-config-templates';

describe('built-in form templates', () => {
  it('every template passes the live form-config schema', () => {
    for (const { id, config } of FORM_TEMPLATES) {
      const result = formConfigSchema.safeParse(config);
      if (!result.success) {
        throw new Error(`Template "${id}" failed schema: ${JSON.stringify(result.error.issues, null, 2)}`);
      }
      expect(result.success).toBe(true);
    }
  });

  it('carries the expected leadType per template', () => {
    expect(RENTAL_APPLICATION_TEMPLATE.leadType).toBe('rental');
    expect(BUYER_INQUIRY_TEMPLATE.leadType).toBe('buyer');
    expect(GENERAL_LEAD_CAPTURE_TEMPLATE.leadType).toBe('general');
  });
});

describe('FORM_TEMPLATES registry', () => {
  it('has unique ids, real names, and a config wired to each entry', () => {
    const ids = FORM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length); // no dup ids
    for (const t of FORM_TEMPLATES) {
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(t.config.sections)).toBe(true);
      expect(t.config.sections.length).toBeGreaterThan(0);
    }
  });

  it('exposes exactly the three documented templates', () => {
    expect(FORM_TEMPLATES.map((t) => t.id)).toEqual([
      'rental-application',
      'buyer-inquiry',
      'general-lead-capture',
    ]);
  });
});
