# Chippi Live Workbench — Current Intelligence Addendum

Date: 2026-07-29
Program evidence type: intelligence

## Fresh practitioner evidence

Recent public practitioner conversations support the Workbench direction while
warning against a complex CRM-shaped interface:

- In a July 25, 2026 Realtor discussion, agents repeatedly describe CRMs as
  complicated or tolerated rather than loved. One practitioner describes a
  working system built around Google Sheets plus an AI interface for querying
  buyer requirements. The consistent signal is usefulness with low ceremony,
  not more configuration.
  - https://www.reddit.com/r/realtors/comments/1v5wn1w/does_anyone_actually_like_using_a_crm/
- In a July 4, 2026 real-estate workflow discussion, one team returned from a
  CRM to a spreadsheet and later kept only status, follow-up date, and notes.
  The signal is that a compact, editable working surface can outperform a
  broad administrative system when it preserves the fields people actually
  use.
  - https://www.reddit.com/r/WholesaleRealestate/comments/1un4lii/how_do_real_estate_teams_manage_daily_workflow/
- A July 2026 real-estate technology discussion includes practitioners still
  combining Excel, automations, AI, contacts, and simple notes. That
  fragmentation is the product opening: Chippi should produce and revise the
  working artifact inside the operating system instead of forcing another
  export/copy loop.
  - https://www.reddit.com/r/RealEstateTechnology/comments/1ugbvvb/anyone_built_a_worthwhile_re_crm/

These are qualitative signals, not market-size proof. They strengthen the
experience hypothesis and define an important counterconstraint: the Workbench
must feel lighter than Excel plus a CRM, not like both products stacked
together.

## Current technology scan

### Handsontable 18

Handsontable 18.0 was released June 30, 2026. Its current React grid offers a
spreadsheet-like theme, editing, and a mature event model. It is commercially
licensed for production use.

- https://handsontable.com/docs/react-data-grid/changelog/
- https://handsontable.com/docs/react-data-grid/themes/

### AG Grid formulas and Excel export

AG Grid's current React product provides formula editing, cell references,
range operations, and Excel export that preserves formulas. Those capabilities
are Enterprise features and introduce a licensing and bundle decision.

- https://www.ag-grid.com/react-data-grid/formulas/
- https://www.ag-grid.com/react-data-grid/excel-export-formulas/

### Univer

Univer's open-source core is Apache-2.0 and includes a rendering engine,
formula engine, Sheets, Docs, Slides, and an AI-oriented MCP ecosystem. The
project separates advanced import/export, collaboration, charts, and other
features into commercial packages. It is strategically aligned with Chippi's
long-term multi-artifact workbench, but integration weight and Pro boundaries
must be measured before adoption.

- https://github.com/dream-num/univer
- https://github.com/dream-num/univer-mcp-start-kit
- https://github.com/dream-num/skills

## Technology decision for Slice A

Build Slice A as a small first-party React grid using the existing Chippi
design system and artifact contract. Do not add a large or licensed dependency
before the interaction and artifact model are validated.

Reasons:

1. The first acceptance test is edit and version one generated artifact, not
   formula parity with Excel.
2. Chippi already depends on ExcelJS for server-side XLSX parsing and creation,
   so export can be added without a second grid vendor.
3. A first-party shell keeps the feature off by default, minimizes Vercel build
   cost, and lets the product team validate the conversation-to-artifact
   interaction before committing to an editor platform.
4. Run a bounded Univer prototype after Slice A. Its unified Sheets/Docs/Slides
   and MCP direction may make it the stronger long-term engine if bundle,
   theming, import/export, and licensing gates pass.

## Decision impact

The implementation agent may build a feature-off, real editable grid and local
version loop now. It may not add a spreadsheet dependency or claim full XLSX
round-trip support. The next technical decision is a measured first-party vs
Univer comparison using the same artifact fixture and Chippi visual acceptance
criteria.
