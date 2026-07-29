# Chippi Live Workbench — Product Reality

Date: 2026-07-29  
Program evidence type: reality

## Verified current state

Chippi already has the pieces of a serious work surface, but they are not yet a
single agent-produced experience:

- The existing Documents panel contains a TipTap editor and versionable
  document records, but its contract explicitly treats the realtor as the only
  author and does not accept agent-created work.
- `read_spreadsheet` can parse CSV, TSV, and XLSX files and perform a small set
  of deterministic aggregates. It is read-only and returns a bounded text/data
  result rather than an editable workbook.
- Realtime Voice Delegation can create a durable, conversation-linked Work
  Session. A Work Session currently produces one Markdown report.
- Chippi's right panel already provides the visual location where a generated
  artifact can open without replacing the conversation.
- Cloud browser components exist but do not yet provide a complete end-to-end
  worker experience. They should eventually deliver sourced tables into the
  same workbench instead of becoming a separate product surface.

## Product gap

Chippi can discuss files and produce a report, but it cannot yet turn a
realtor's instruction into an editable business deliverable inside the
workspace. The customer still has to copy agent output into Excel, Docs, or
presentation software and manually continue the work there.

## Decision impact

The next product cycle must produce a customer-visible artifact surface, not
more infrastructure hardening. Draft mode removal is complete and Realtime
Voice Delegation remains the accepted control direction. The primary lane is
now Chippi Live Workbench.

## Source evidence

- `app/s/[slug]/documents/documents-panel.tsx`
- `lib/ai-tools/tools/read-spreadsheet.ts`
- `lib/work-sessions/engine.ts`
- `components/chippi/chippi-workspace.tsx`
- `components/chippi/browser-control-panel.tsx`
- `app/api/browser-control/headless/start/route.ts`
- `agent/browser_headless.py`
- `docs/audits/draft-mode-removal/DRAFT_MODE_REMOVAL_AUDIT.md`

