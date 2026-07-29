# Chippi Live Workbench — Slice B Quality Matrix

Date: 2026-07-29
Scoring rule: 1–10, evidence-weighted, brutally honest
Activation threshold: every critical dimension at least 9/10 with runtime evidence

| # | Dimension | Score | Evidence |
|---:|---|---:|---|
| 1 | Product-direction fit | 9.4 | Directly advances agent + chat interaction |
| 2 | Real-estate workflow usefulness | 8.8 | Strong pipeline/comp surface; transformation layer is next |
| 3 | Differentiation | 8.7 | Agent-created editable work surface, not a wrapper response |
| 4 | Concept clarity | 9.2 | “Workbench” replaces confusing “Draft Mode” |
| 5 | Conversation-to-workflow coherence | 9.0 | Upload, ask, approve, open |
| 6 | Approval clarity | 9.2 | Exact filename and stable attachment ID |
| 7 | Progressive disclosure | 8.8 | Workbench opens only on explicit intent |
| 8 | Copy honesty | 9.4 | Immutable source, version, sheet, and format limitations disclosed |
| 9 | Narrow-screen usability | 7.5 | Horizontal affordance exists; browser evidence missing |
| 10 | Accessibility semantics | 8.3 | Labels/region/table semantics present; runtime audit missing |
| 11 | Motion quality | 7.5 | Existing panel motion preserved; no visual motion audit |
| 12 | Brand cohesion | 8.8 | Uses existing right-panel visual language |
| 13 | Intent routing | 8.5 | Explicit open/edit only; negation remains lexical |
| 14 | Modal/TypeScript routing integrity | 9.1 | Narrow override plus tested resume path |
| 15 | Current-turn attachment authority | 9.5 | Persisted server manifest, exact ID + filename |
| 16 | Approval persistence | 9.2 | Legitimate pause/resume and legacy denial tested |
| 17 | Disable/cancellation boundary | 9.2 | Feature and workspace checked after pause |
| 18 | Tenant isolation | 9.4 | Caller tenant resolved before artifact lookup |
| 19 | Feature-off completeness | 9.5 | Catalog, handler, UI, list, detail, edit, download, resume |
| 20 | Atomic create/save | 9.6 | Real staging transaction proof |
| 21 | Concurrent version ordering | 9.5 | Simultaneous staging appends produced 2 and 3 |
| 22 | Rollback integrity | 9.5 | Forced failure preserved rows and pointer |
| 23 | Version-history integrity | 9.2 | Immutable saves, selector merge, lazy history |
| 24 | Export correctness | 8.8 | Real XLSX unit proof; browser download not run |
| 25 | Workbook data bounds | 9.3 | 500 rows, 50 columns, 2 MiB content, cell limits |
| 26 | History/payload bounds | 9.3 | Metadata-only 20-row response, lazy content |
| 27 | Input-format honesty | 9.2 | CSV/TSV/XLSX supported; `.xls` explicitly rejected |
| 28 | Multi-sheet honesty | 9.2 | First-sheet scope persisted and displayed |
| 29 | Failure recovery UX | 8.6 | Edit retained after save failure; storage faults not staged |
| 30 | Interaction latency | 7.0 | No staged p50/p95 measurements |
| 31 | Token efficiency | 8.5 | Tool exposed only on relevant turns; no measured token delta |
| 32 | Tool discoverability | 8.8 | Natural explicit-intent routing; no user study |
| 33 | Focused test quality | 9.4 | 63 tests, adversarial resume and API coverage |
| 34 | Regression confidence | 9.5 | 5,000-pass clean-commit suite |
| 35 | Database runtime evidence | 9.5 | Grants, concurrency, rollback, cleanup verified on staging |
| 36 | Authenticated browser evidence | 3.0 | Not run |
| 37 | Cross-browser evidence | 1.0 | Not run |
| 38 | Production readiness | 5.0 | Feature off; no deployment or production migration |

## Gate decision

- **Local engineering gate: PASS.**
- **Staging product-experience gate: NO-GO.**
- **Production activation gate: NO-GO.**

The low browser, cross-browser, latency, and production-readiness scores are not
papered over by the strong code and database scores. The next loop must produce
runtime evidence rather than more architecture.
