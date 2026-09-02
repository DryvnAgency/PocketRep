Native contact delete audit, 2026-09-02:
- contacts.tsx previously hard-deleted rows.
- lib/v2/updateContact.ts already uses is_deleted soft deletion to preserve activity/deal history.
- Native contacts loader now excludes is_deleted=true rows.
- Native delete now mirrors soft-delete semantics and verifies the row changed.
This file is temporary audit evidence and may be removed before merge if desired.
