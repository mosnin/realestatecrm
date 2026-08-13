import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'components/ai/blocks/tool-call-block-view.tsx',
  'utf8',
);

describe('Chippi execution receipt UI contract', () => {
  it('names real execution as execution, never drafting', () => {
    expect(source).toContain("send_email: 'Sending email…'");
    expect(source).toContain("send_sms: 'Sending text…'");
    expect(source).toContain("add_person: 'Creating contact…'");
    expect(source).toContain("create_automation: 'Creating automation…'");
    expect(source).toContain(
      "analyze_property_values: 'Analyzing property values…'",
    );
    expect(source).not.toContain("send_email: 'Drafting…'");
    expect(source).not.toContain("send_sms: 'Writing…'");
  });

  it('uses outcome-specific completion labels', () => {
    expect(source).toContain("send_email: 'Email sent'");
    expect(source).toContain("send_sms: 'Text sent'");
    expect(source).toContain("add_person: 'Contact created'");
    expect(source).toContain("create_automation: 'Automation created'");
    expect(source).toContain("analyze_property_values: 'Analysis grounded'");
    expect(source).toContain(
      "TOOL_COMPLETE_LABEL[block.name] ?? `${friendlyName(block.name)} complete`",
    );
  });

  it('shows server-confirmed summaries inline only for successful execution receipts', () => {
    expect(source).toContain('const EXECUTION_RECEIPT_TOOLS');
    expect(source).toContain("status === 'complete'");
    expect(source).toContain('block.result?.ok === true');
    expect(source).toContain('EXECUTION_RECEIPT_TOOLS.has(block.name)');
    expect(source).toContain('aria-label="Execution receipt"');
    expect(source).toContain('border-emerald-500/15 bg-emerald-500/[0.035]');
  });
});
