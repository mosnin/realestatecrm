# Data deletion and export

GDPR right to erasure / CCPA right to delete (Privacy Policy §11.1) and
portability. Implementation: `lib/account-deletion.ts`, `lib/data-export.ts`.

**Hard-delete is off until this document is signed off.** Set
`ACCOUNT_DELETION_HARD_DELETE=true` only after a staging dry-run that includes
Wasabi GC. With the flag off, self-serve and admin delete still remove the
Clerk login and record the request; workspace rows wait for a reviewed run.

## Export (what we give back)

`SPACE_SCOPED_TABLES` in `lib/data-export.ts` is the list. Self-serve
`/api/account/export` and admin DSAR `/api/admin/users/[id]/export` must stay
identical. Keep that array in sync with this file.

Every read is `.eq('spaceId', spaceId)` (or through parent ids for
`DealContact`). The caller derives `spaceId` from auth — never from the
request body.

## Delete (what we remove)

### Cascades (Postgres FK)

- `Space.ownerId → User(id) ON DELETE CASCADE`
- Almost every Space-scoped table → `Space(id) ON DELETE CASCADE`

Deleting the User row therefore removes Space, Contact, Deal, Property,
Conversation, Message, Note, Tour, and the rest of the FK graph. We do not
hand-roll that order.

### Swept explicitly (before User delete)

| Table / store | Why |
|---|---|
| `Attachment` | `spaceId` but no FK to Space |
| `TelemetryEvent` | nullable `spaceId`, no FK |
| Wasabi objects | Postgres cannot cascade into object storage |

Wasabi keys are collected while the rows still exist:

- `Attachment.storagePath`
- `File.storageKey`
- `DealDocument.storagePath`
- `ContactDocument.storageKey`

Blob delete is best-effort. Failures must not abort the DB sweep. Nightly
`cron-storage-gc` catches orphans.

### Intentionally retained

| Record | Why |
|---|---|
| Stripe customer / invoices | Legal/financial retention at Stripe |
| `CommissionLedger` | Brokerage-owned financial record |
| `SupportTicket` / some Property pool rows | `ON DELETE SET NULL` |

## Blockers

`Brokerage.ownerId → User(id) ON DELETE RESTRICT`. A brokerage owner must
transfer or close the brokerage first (`checkDeletionBlockers`).

## Sign-off

- Staging dry-run date:
- Wasabi orphans confirmed swept:
- Owner:
