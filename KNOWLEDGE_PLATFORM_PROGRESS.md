# Sobdai Knowledge Platform — Progress

## 1. Overview

The Knowledge Platform provides reusable knowledge assets—such as Summaries,
Questions, and future learning assets—that can be referenced by Packages,
Exam Sets, and future Products. A shared asset is created once and reused
across products.

This document tracks implementation progress only. The approved architecture,
data model, database schema, migration strategy, and SQL Migration Design are
the authoritative frozen specifications.

## 2. Current Phase

| Phase | Status |
|---|---|
| Planning | Complete |
| Reference Layer | Complete |
| Knowledge Layer | Not started |
| Package Integration | Not started |
| Migration | Not started |
| Cutover | Not started |

Current phase: **Reference Layer complete**.

Next phase: **Knowledge Layer**.

## 3. Implementation Progress

- [x] Planning — Complete
- [x] Reference Layer — Complete
- [ ] Knowledge Layer — Not Started
- [ ] Package Integration — Not Started
- [ ] Migration Backfill — Not Started
- [ ] Cutover — Not Started

## 4. Migration Progress

Migration numbers are the canonical identity. Batch labels are organizational
metadata only.

| Migration | Knowledge Platform status |
|---|---|
| 035 `035_kp_preflight_guards.sql` | ✅ Complete |
| 036 `036_kp_migration_control.sql` | ✅ Complete |
| 037 `037_news_cta_config.sql` | ✅ Complete — existing production migration |
| 038 `038_kp_reference_documents.sql` | ✅ Complete |
| 039 `039_kp_reference_document_versions.sql` | ✅ Complete |
| 040 `040_kp_reference_document_aliases.sql` | ✅ Complete |
| 041+ Knowledge Platform migrations | ⬜ Not Started |

The repository also contains `041_news_gp_exam_requirement.sql`, which is an
unrelated News migration and is not a Knowledge Platform milestone.

## 5. Completed Milestones

- Planning Complete
- Knowledge Platform Architecture v1 frozen
- Knowledge Platform Data Model v1 frozen
- Knowledge Platform Database Schema v1 frozen
- Knowledge Platform Migration Strategy v1 frozen
- Knowledge Platform SQL Migration Design v1 frozen
- Migration numbering reconciled with production migration history
- Batch A migration foundation complete: migrations 035–036
- Reference Layer complete: migrations 038–040
- Reference Layer migrations reviewed, committed, executed successfully, and deployed

## 6. Current Sprint

**Current Sprint:** Reference Layer Completed

Migrations 038, 039, and 040 establish the ReferenceDocument root, immutable
source versions, and direct historical aliases.

**Next Sprint:** Knowledge Layer

## 7. Next Recommended Work

Implement the frozen Knowledge/Product expansion in canonical migration order:

1. Migration 041 — expand the existing Summary root.
2. Migration 042 — create Summary versions.
3. Migration 043 — create Summary relationships and source relationships.
4. Migration 044 — create Package-to-Summary placements.
5. Migration 045 — install the target RLS foundation.
6. Migration 046 — add the planned online indexes.
7. Validate the Knowledge Layer migration set before beginning backfill migrations.

Before implementing the next Knowledge Platform migration, reconcile its
canonical number with any newer unrelated production migration that may have
been added to the repository.

## 8. Future Milestones

- Knowledge Layer
- Summary Library
- Summary Versioning
- Package Summary Mapping
- Summary Picker
- Content Migration
- Public Summary
- Recommendation Integration
- Adaptive Learning

## 9. Notes

- Architecture is frozen.
- Data Model is frozen.
- Database Schema is frozen.
- Migration Strategy is frozen.
- SQL Migration Design is frozen.
- Migration numbers are canonical; batch labels are secondary.
- Future migrations must continue from the latest production migration number after numbering conflicts are reconciled.
- Migrations 035–040 are deployed and must not be redesigned.
- Knowledge Platform migrations 041 and later have not started.
- Assessment Engine, Recommendation Engine, Candidate Discovery, and Domain B contracts are outside this progress tracker’s implementation scope.
