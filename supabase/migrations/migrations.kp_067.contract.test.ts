/**
 * G1 contract lock for the greenfield Summary cutover.
 *
 * These tests describe the post-cutover contract and statically guard 067
 * against historical marker backfill and total-Summary marker assumptions.
 *
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_067.contract.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type NullableString = string | null;

type SummaryIdentity = {
  summary_code: NullableString;
  canonical_slug: NullableString;
  canonical_title: NullableString;
  visibility: NullableString;
  lifecycle_status: NullableString;
};

type SummaryContractRow = SummaryIdentity & {
  current_published_version_id: NullableString;
  memberships: readonly PackageMembership[];
};

type PackageMembership = {
  package_id: string;
  is_summary_bank_compatibility: boolean;
};

type SummaryClassification = 'legacy' | 'kp_native';

const KP_VISIBILITIES = new Set([
  'public_indexable',
  'authenticated',
  'product_entitled',
]);

const KP_LIFECYCLE_STATUSES = new Set(['active', 'archived']);

const migrationDir = dirname(fileURLToPath(import.meta.url));
const migration067 = readFileSync(
  join(migrationDir, '067_kp_summary_bank_compatibility_marker.sql'),
  'utf8',
);

function withoutLineComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

const executable067 = withoutLineComments(migration067);

function isNonBlank(value: NullableString): value is string {
  return value !== null && value.trim().length > 0;
}

function identityFields(row: SummaryIdentity): readonly NullableString[] {
  return [
    row.summary_code,
    row.canonical_slug,
    row.canonical_title,
    row.visibility,
    row.lifecycle_status,
  ];
}

/** The five KP identity fields are either all NULL (legacy) or all present. */
function hasAllOrNoneKpIdentity(row: SummaryIdentity): boolean {
  const fields = identityFields(row);
  const present = fields.map((field) => field !== null);
  return present.every((isPresent) => isPresent === present[0]);
}

function hasValidKpIdentity(row: SummaryIdentity): boolean {
  if (!hasAllOrNoneKpIdentity(row) || row.summary_code === null) {
    return false;
  }

  return (
    isNonBlank(row.summary_code) &&
    row.summary_code === row.summary_code.toUpperCase() &&
    isNonBlank(row.canonical_slug) &&
    row.canonical_slug === row.canonical_slug.toLowerCase() &&
    isNonBlank(row.canonical_title) &&
    row.visibility !== null &&
    KP_VISIBILITIES.has(row.visibility) &&
    row.lifecycle_status !== null &&
    KP_LIFECYCLE_STATUSES.has(row.lifecycle_status)
  );
}

function classifySummary(row: SummaryIdentity): SummaryClassification {
  return row.summary_code === null ? 'legacy' : 'kp_native';
}

function markerCount(row: SummaryContractRow): number {
  return row.memberships.filter(
    (membership) => membership.is_summary_bank_compatibility,
  ).length;
}

function hasDistinctPackageMemberships(row: SummaryContractRow): boolean {
  const packageIds = row.memberships.map((membership) => membership.package_id);
  return (
    packageIds.every((packageId) => packageId.trim().length > 0) &&
    new Set(packageIds).size === packageIds.length
  );
}

function isValidLegacySummary(row: SummaryContractRow): boolean {
  return (
    classifySummary(row) === 'legacy' &&
    hasAllOrNoneKpIdentity(row) &&
    identityFields(row).every((field) => field === null) &&
    row.current_published_version_id === null &&
    row.memberships.length === 0
  );
}

function isValidKpNativeSummary(row: SummaryContractRow): boolean {
  return (
    classifySummary(row) === 'kp_native' &&
    hasValidKpIdentity(row) &&
    row.memberships.length >= 1 &&
    hasDistinctPackageMemberships(row) &&
    markerCount(row) === 1
  );
}

function legacySummary(): SummaryContractRow {
  return {
    summary_code: null,
    canonical_slug: null,
    canonical_title: null,
    visibility: null,
    lifecycle_status: null,
    current_published_version_id: null,
    memberships: [],
  };
}

function kpNativeSummary(
  memberships: readonly PackageMembership[] = [
    { package_id: 'package-a', is_summary_bank_compatibility: true },
  ],
  currentPublishedVersionId: NullableString = null,
): SummaryContractRow {
  return {
    summary_code: 'SUM-000001',
    canonical_slug: 'greenfield-summary',
    canonical_title: 'Greenfield Summary',
    visibility: 'public_indexable',
    lifecycle_status: 'active',
    current_published_version_id: currentPublishedVersionId,
    memberships,
  };
}

function runContractTests(): void {
  const tests = [
    [
      'legacy summaries are grandfathered with no placement or marker',
      () => {
        const legacy = legacySummary();

        assert.equal(classifySummary(legacy), 'legacy');
        assert.equal(isValidLegacySummary(legacy), true);
        assert.equal(legacy.memberships.length, 0);
        assert.equal(markerCount(legacy), 0);
      },
    ],
    [
      'summary_code non-NULL identifies KP-native state',
      () => {
        const kp = kpNativeSummary();

        assert.equal(classifySummary(kp), 'kp_native');
        assert.equal(isValidKpNativeSummary(kp), true);
      },
    ],
    [
      'KP-native identity is all-or-none and publication pointer may be NULL',
      () => {
        const draft = kpNativeSummary();

        assert.equal(hasAllOrNoneKpIdentity(draft), true);
        assert.equal(hasValidKpIdentity(draft), true);
        assert.equal(draft.current_published_version_id, null);
        assert.equal(isValidKpNativeSummary(draft), true);

        const published = kpNativeSummary(
          [{ package_id: 'package-a', is_summary_bank_compatibility: true }],
          'version-000001',
        );
        assert.equal(isValidKpNativeSummary(published), true);
      },
    ],
    [
      'partial or malformed KP identity is invalid',
      () => {
        const partial = {
          ...legacySummary(),
          summary_code: 'SUM-000002',
          canonical_slug: null,
          canonical_title: 'Missing slug',
          visibility: 'public_indexable',
          lifecycle_status: 'active',
          memberships: [
            { package_id: 'package-a', is_summary_bank_compatibility: true },
          ],
        } satisfies SummaryContractRow;
        assert.equal(classifySummary(partial), 'kp_native');
        assert.equal(hasAllOrNoneKpIdentity(partial), false);
        assert.equal(isValidKpNativeSummary(partial), false);

        const malformed = {
          ...kpNativeSummary(),
          summary_code: 'sum-000003',
        } satisfies SummaryContractRow;
        assert.equal(hasValidKpIdentity(malformed), false);
        assert.equal(isValidKpNativeSummary(malformed), false);
      },
    ],
    [
      'KP-native summaries require one or more memberships and exactly one marker',
      () => {
        assert.equal(
          isValidKpNativeSummary({
            ...kpNativeSummary(),
            memberships: [],
          }),
          false,
        );
        assert.equal(
          isValidKpNativeSummary({
            ...kpNativeSummary(),
            memberships: [
              { package_id: 'package-a', is_summary_bank_compatibility: true },
              { package_id: 'package-b', is_summary_bank_compatibility: true },
            ],
          }),
          false,
        );
      },
    ],
    [
      'secondary memberships are product memberships with marker=false',
      () => {
        const multiPackage = kpNativeSummary([
          { package_id: 'package-a', is_summary_bank_compatibility: true },
          { package_id: 'package-b', is_summary_bank_compatibility: false },
          { package_id: 'package-c', is_summary_bank_compatibility: false },
        ]);

        assert.equal(multiPackage.memberships.length, 3);
        assert.equal(markerCount(multiPackage), 1);
        assert.equal(isValidKpNativeSummary(multiPackage), true);

        assert.equal(
          isValidKpNativeSummary(
            kpNativeSummary([
              { package_id: 'package-a', is_summary_bank_compatibility: true },
              { package_id: 'package-a', is_summary_bank_compatibility: false },
            ]),
          ),
          false,
        );
      },
    ],
    [
      'the hybrid starting state is 29 legacy rows with zero placements',
      () => {
        const legacyRows = Array.from({ length: 29 }, legacySummary);
        const totalMarkers = legacyRows.reduce(
          (count, row) => count + markerCount(row),
          0,
        );

        assert.equal(legacyRows.every(isValidLegacySummary), true);
        assert.equal(totalMarkers, 0);
        assert.notEqual(totalMarkers, legacyRows.length);
      },
    ],
    [
      '067 performs no historical Summary or placement DML',
      () => {
        assert.doesNotMatch(
          executable067,
          /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:summaries|package_summaries)\b/i,
        );
      },
    ],
    [
      '067 does not require one marker for every historical Summary',
      () => {
        assert.doesNotMatch(
          executable067,
          /v_marked_count\s*<>\s*v_expected_count/i,
        );
        assert.doesNotMatch(
          executable067,
          /exactly\s+one\s+marked\s+placement\s+for\s+every\s+summary/i,
        );
        assert.doesNotMatch(
          executable067,
          /marker\s+count\s+mismatch/i,
        );
      },
    ],
    [
      '067 installs hybrid identity and membership reconciliation',
      () => {
        assert.match(executable067, /summaries_kp_identity_bundle_check/i);
        assert.match(
          executable067,
          /summary_code\s+is\s+null[\s\S]*canonical_slug\s+is\s+null/i,
        );
        assert.match(
          executable067,
          /summary_code\s+is\s+not\s+null[\s\S]*canonical_slug\s+is\s+not\s+null/i,
        );
        assert.match(executable067, /legacy Summary with a Package membership/i);
        assert.match(executable067, /KP-native Summary without a Package membership/i);
        assert.match(executable067, /KP-native Summary without one compatibility marker/i);
      },
    ],
  ] as const;

  for (const [name, test] of tests) {
    test();
    console.log(`PASS ${name}`);
  }

  console.log(`\n${tests.length} G1 contract tests passed`);
}

runContractTests();
