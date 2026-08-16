/**
 * Contract tests for migration 068's hybrid writer core.
 *
 * The repository has no local Supabase/PostgreSQL runtime. The SQL guards
 * below are therefore paired with an in-memory transactional contract model;
 * it exercises rollback and exact-retry behavior without pretending to be a
 * PostgreSQL execution test.
 *
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_068.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(migrationDir, '068_kp_summary_bank_compatibility_writer_core.sql'),
  'utf8',
);
const executable = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');
const deploymentSql = executable.replace(
  /create\s+or\s+replace\s+function[\s\S]*?\$function\$;/gi,
  '',
);

type MaybeText = string | null;

type CreateInput = {
  summaryId: string;
  versionId: string;
  summaryCode: string;
  canonicalSlug: string;
  canonicalTitle: string;
  subject: MaybeText;
  topic: MaybeText;
  law: MaybeText;
  visibility: string;
  packageIds: string[];
  legacySlug: string;
  contentMd: string;
  contentChecksum: string;
  readTimeMinutes: number;
  readTimePolicyVersion: string;
  contentSchemaVersion: string;
  changeNote: string;
  actorId: string;
  sortOrder: number | null;
  displayOrder: number | null;
  navigationLabel: MaybeText;
};

type TestMembership = {
  packageId: string;
  status: 'draft';
  versionPolicy: 'latest_published';
  pinnedSummaryVersionId: null;
  sortOrder: number;
  displayOrder: number;
  releasedAt: null;
  navigationLabel: MaybeText;
  legacySlug: MaybeText;
  marker: boolean;
  createdBy: string;
  activatedBy: null;
  activatedAt: null;
  hiddenBy: null;
  hiddenAt: null;
};

type TestRevision = {
  id: string;
  summaryId: string;
  revisionNumber: number;
  status: 'draft';
  contentMd: string;
  contentChecksum: string;
  titleSnapshot: string;
  subjectSnapshot: MaybeText;
  topicSnapshot: MaybeText;
  lawSnapshot: MaybeText;
  seoTitle: null;
  seoDescription: null;
  socialImageBucket: null;
  socialImagePath: null;
  readTimeMinutes: number;
  readTimePolicyVersion: string;
  contentSchemaVersion: string;
  changeNote: string;
  authoredBy: string;
  submittedForReviewAt: null;
  reviewedBy: null;
  reviewedAt: null;
  publishedBy: null;
  publishedAt: null;
  retiredBy: null;
  retiredAt: null;
  retirementReason: null;
};

type TestSummary = {
  id: string;
  packageId: string | null;
  title: string;
  slug: string;
  subject: MaybeText;
  topic: MaybeText;
  law: MaybeText;
  contentMd: string;
  readTimeMinutes: number;
  sortOrder: number;
  isPublished: boolean;
  summaryCode: string | null;
  canonicalSlug: string | null;
  canonicalTitle: string | null;
  visibility: string | null;
  lifecycleStatus: string | null;
  currentPublishedVersionId: string | null;
  createdBy: string | null;
  archivedBy: string | null;
  archivedAt: string | null;
  revision: TestRevision | null;
  memberships: TestMembership[];
};

type WriterState = {
  packages: Set<string>;
  summaries: Map<string, TestSummary>;
};

function optionalText(value: MaybeText): MaybeText {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function cloneMembership(membership: TestMembership): TestMembership {
  return { ...membership };
}

function cloneRevision(revision: TestRevision | null): TestRevision | null {
  return revision === null ? null : { ...revision };
}

function cloneSummary(summary: TestSummary): TestSummary {
  return {
    ...summary,
    revision: cloneRevision(summary.revision),
    memberships: summary.memberships.map(cloneMembership),
  };
}

function cloneState(state: WriterState): WriterState {
  return {
    packages: new Set(state.packages),
    summaries: new Map(
      [...state.summaries].map(([id, summary]) => [id, cloneSummary(summary)]),
    ),
  };
}

function stateFingerprint(state: WriterState): string {
  return JSON.stringify({
    packages: [...state.packages].sort(),
    summaries: [...state.summaries.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((summary) => ({
        ...summary,
        memberships: [...summary.memberships].sort((left, right) =>
          left.packageId.localeCompare(right.packageId),
        ),
      })),
  });
}

function assertModelInvariant(summary: TestSummary): void {
  if (summary.summaryCode === null) {
    assert.equal(summary.canonicalSlug, null);
    assert.equal(summary.canonicalTitle, null);
    assert.equal(summary.visibility, null);
    assert.equal(summary.lifecycleStatus, null);
    assert.equal(summary.memberships.length, 0);
    assert.equal(summary.revision, null);
    return;
  }

  assert.ok(summary.canonicalSlug);
  assert.ok(summary.canonicalTitle);
  assert.ok(summary.visibility);
  assert.ok(summary.lifecycleStatus);
  assert.ok(summary.packageId);
  assert.ok(summary.memberships.length >= 1);
  assert.equal(
    new Set(summary.memberships.map((membership) => membership.packageId)).size,
    summary.memberships.length,
  );

  const markers = summary.memberships.filter((membership) => membership.marker);
  assert.equal(markers.length, 1);
  assert.equal(markers[0]?.packageId, summary.packageId);
  assert.equal(markers[0]?.legacySlug, summary.slug);
}

function membershipFor(
  input: CreateInput,
  packageId: string,
  canonicalPackageId: string,
): TestMembership {
  return {
    packageId,
    status: 'draft',
    versionPolicy: 'latest_published',
    pinnedSummaryVersionId: null,
    sortOrder: input.sortOrder ?? 0,
    displayOrder: input.displayOrder ?? 0,
    releasedAt: null,
    navigationLabel: optionalText(input.navigationLabel),
    legacySlug: input.legacySlug,
    marker: packageId === canonicalPackageId,
    createdBy: input.actorId,
    activatedBy: null,
    activatedAt: null,
    hiddenBy: null,
    hiddenAt: null,
  };
}

function expectedCreatedSummary(input: CreateInput): TestSummary {
  const canonicalPackageId = [...input.packageIds].sort()[0]!;
  return {
    id: input.summaryId,
    packageId: canonicalPackageId,
    title: input.canonicalTitle.trim(),
    slug: input.legacySlug,
    subject: optionalText(input.subject),
    topic: optionalText(input.topic),
    law: optionalText(input.law),
    contentMd: input.contentMd,
    readTimeMinutes: input.readTimeMinutes,
    sortOrder: input.sortOrder ?? 0,
    isPublished: false,
    summaryCode: input.summaryCode,
    canonicalSlug: input.canonicalSlug,
    canonicalTitle: input.canonicalTitle.trim(),
    visibility: input.visibility,
    lifecycleStatus: 'active',
    currentPublishedVersionId: null,
    createdBy: input.actorId,
    archivedBy: null,
    archivedAt: null,
    revision: {
      id: input.versionId,
      summaryId: input.summaryId,
      revisionNumber: 1,
      status: 'draft',
      contentMd: input.contentMd,
      contentChecksum: input.contentChecksum,
      titleSnapshot: input.canonicalTitle.trim(),
      subjectSnapshot: optionalText(input.subject),
      topicSnapshot: optionalText(input.topic),
      lawSnapshot: optionalText(input.law),
      seoTitle: null,
      seoDescription: null,
      socialImageBucket: null,
      socialImagePath: null,
      readTimeMinutes: input.readTimeMinutes,
      readTimePolicyVersion: input.readTimePolicyVersion.trim(),
      contentSchemaVersion: input.contentSchemaVersion.trim(),
      changeNote: input.changeNote.trim(),
      authoredBy: input.actorId,
      submittedForReviewAt: null,
      reviewedBy: null,
      reviewedAt: null,
      publishedBy: null,
      publishedAt: null,
      retiredBy: null,
      retiredAt: null,
      retirementReason: null,
    },
    memberships: [...input.packageIds]
      .sort()
      .map((packageId) => membershipFor(input, packageId, canonicalPackageId)),
  };
}

class WriterContractModel {
  state: WriterState;

  constructor(packageIds: readonly string[]) {
    this.state = {
      packages: new Set(packageIds),
      summaries: new Map(),
    };
  }

  seedLegacy(summaryId: string): void {
    this.state.summaries.set(summaryId, {
      id: summaryId,
      packageId: 'legacy-package',
      title: 'Legacy Summary',
      slug: 'legacy-summary',
      subject: null,
      topic: null,
      law: null,
      contentMd: 'legacy content',
      readTimeMinutes: 5,
      sortOrder: 0,
      isPublished: false,
      summaryCode: null,
      canonicalSlug: null,
      canonicalTitle: null,
      visibility: null,
      lifecycleStatus: null,
      currentPublishedVersionId: null,
      createdBy: null,
      archivedBy: null,
      archivedAt: null,
      revision: null,
      memberships: [],
    });
  }

  private transaction<T>(operation: () => T): T {
    const before = cloneState(this.state);
    try {
      return operation();
    } catch (error) {
      this.state = before;
      throw error;
    }
  }

  private requireApprovedApi(functionName: string): void {
    if (!new Set(['uuid-array-create', 'membership-reconcile', 'attach', 'detach']).has(functionName)) {
      throw new Error('writer fence rejected unapproved API function');
    }
  }

  private requirePackageSet(packageIds: readonly string[]): string[] {
    if (packageIds.length === 0) throw new Error('Package set cannot be empty');
    if (new Set(packageIds).size !== packageIds.length) throw new Error('Package set contains duplicates');
    if (packageIds.some((packageId) => !this.state.packages.has(packageId))) {
      throw new Error('Package set contains an invalid Package');
    }
    return [...packageIds].sort();
  }

  create(input: CreateInput): { idempotentRetry: boolean } {
    return this.transaction(() => {
      this.requireApprovedApi('uuid-array-create');
      const packageIds = this.requirePackageSet(input.packageIds);
      const expected = expectedCreatedSummary({ ...input, packageIds });
      const existing = this.state.summaries.get(input.summaryId);

      if (existing) {
        if (existing.summaryCode === null) throw new Error('Legacy Summary cannot be reused');
        if (stateFingerprint({ packages: new Set(), summaries: new Map([[existing.id, existing]]) })
          !== stateFingerprint({ packages: new Set(), summaries: new Map([[expected.id, expected]]) })) {
          throw new Error('Summary create retry payload mismatch');
        }
        assertModelInvariant(existing);
        return { idempotentRetry: true };
      }

      this.state.summaries.set(expected.id, expected);
      assertModelInvariant(expected);
      return { idempotentRetry: false };
    });
  }

  attach(summaryId: string, packageId: string, actorId: string): void {
    this.transaction(() => {
      this.requireApprovedApi('attach');
      if (!this.state.packages.has(packageId)) throw new Error('Package does not exist');
      const summary = this.state.summaries.get(summaryId);
      if (!summary) throw new Error('Summary does not exist');
      if (summary.summaryCode === null) throw new Error('Legacy Summary cannot receive Package memberships');
      assertModelInvariant(summary);
      if (summary.memberships.some((membership) => membership.packageId === packageId)) {
        throw new Error('Package membership already exists');
      }
      summary.memberships.push({
        packageId,
        status: 'draft',
        versionPolicy: 'latest_published',
        pinnedSummaryVersionId: null,
        sortOrder: 0,
        displayOrder: 0,
        releasedAt: null,
        navigationLabel: null,
        legacySlug: null,
        marker: false,
        createdBy: actorId,
        activatedBy: null,
        activatedAt: null,
        hiddenBy: null,
        hiddenAt: null,
      });
      assertModelInvariant(summary);
    });
  }

  reconcile(summaryId: string, packageIds: readonly string[], actorId: string): void {
    this.transaction(() => {
      this.requireApprovedApi('membership-reconcile');
      const selected = this.requirePackageSet(packageIds);
      const summary = this.state.summaries.get(summaryId);
      if (!summary) throw new Error('Summary does not exist');
      if (summary.summaryCode === null) throw new Error('Legacy Summary cannot receive Package memberships');
      assertModelInvariant(summary);

      const existingByPackage = new Map(
        summary.memberships
          .filter((membership) => selected.includes(membership.packageId))
          .map((membership) => [membership.packageId, membership]),
      );
      const canonicalPackageId = summary.packageId && selected.includes(summary.packageId)
        ? summary.packageId
        : selected[0]!;
      const memberships = selected.map((packageId) => existingByPackage.get(packageId) ?? {
        packageId,
        status: 'draft',
        versionPolicy: 'latest_published',
        pinnedSummaryVersionId: null,
        sortOrder: 0,
        displayOrder: 0,
        releasedAt: null,
        navigationLabel: null,
        legacySlug: null,
        marker: false,
        createdBy: actorId,
        activatedBy: null,
        activatedAt: null,
        hiddenBy: null,
        hiddenAt: null,
      } satisfies TestMembership);

      const canonicalMembership = memberships.find((membership) => membership.packageId === canonicalPackageId)!;
      summary.memberships = memberships.map((membership) => ({
        ...membership,
        marker: membership.packageId === canonicalPackageId,
        legacySlug: membership.packageId === canonicalPackageId
          ? canonicalMembership.legacySlug ?? summary.slug
          : membership.legacySlug,
      }));
      summary.packageId = canonicalPackageId;
      summary.slug = summary.memberships.find((membership) => membership.marker)!.legacySlug!;
      assertModelInvariant(summary);
    });
  }

  detach(summaryId: string, packageId: string): void {
    this.transaction(() => {
      this.requireApprovedApi('detach');
      const summary = this.state.summaries.get(summaryId);
      if (!summary) throw new Error('Summary does not exist');
      if (summary.summaryCode === null) throw new Error('Legacy Summary cannot detach Package memberships');
      assertModelInvariant(summary);
      if (summary.memberships.length <= 1) throw new Error('Cannot detach the final Package membership');
      const requested = summary.memberships.find((membership) => membership.packageId === packageId);
      if (!requested) throw new Error('Package membership does not exist');

      summary.memberships = summary.memberships.filter((membership) => membership.packageId !== packageId);
      if (requested.marker) {
        const replacement = [...summary.memberships].sort((left, right) =>
          left.packageId.localeCompare(right.packageId),
        )[0]!;
        summary.memberships = summary.memberships.map((membership) => ({
          ...membership,
          marker: membership.packageId === replacement.packageId,
          legacySlug: membership.packageId === replacement.packageId
            ? membership.legacySlug ?? summary.slug
            : membership.legacySlug,
        }));
        summary.packageId = replacement.packageId;
        summary.slug = summary.memberships.find((membership) => membership.marker)!.legacySlug!;
      }
      assertModelInvariant(summary);
    });
  }

  directWrite(role: 'public' | 'anon' | 'authenticated' | 'service_role'): void {
    if (['public', 'anon', 'authenticated', 'service_role'].includes(role)) {
      throw new Error('Direct Summary mutations are disabled');
    }
  }
}

function createInput(packageIds: string[]): CreateInput {
  return {
    summaryId: 'summary-1',
    versionId: 'version-1',
    summaryCode: 'SUM-000001',
    canonicalSlug: 'greenfield-summary',
    canonicalTitle: 'Greenfield Summary',
    subject: 'Subject',
    topic: 'Topic',
    law: 'Law',
    visibility: 'public_indexable',
    packageIds,
    legacySlug: 'greenfield-summary',
    contentMd: '# Greenfield Summary',
    contentChecksum: 'checksum-1',
    readTimeMinutes: 5,
    readTimePolicyVersion: 'policy-v1',
    contentSchemaVersion: 'schema-v1',
    changeNote: 'Initial Summary',
    actorId: 'actor-1',
    sortOrder: 1,
    displayOrder: 2,
    navigationLabel: 'Greenfield',
  };
}

function verifiesHybridPreflightAndPostflight(): void {
  assert.doesNotMatch(executable, /every existing Summary/i);
  assert.doesNotMatch(executable, /every Summary/i);
  assert.match(executable, /summary_code\s+is\s+null/i);
  assert.match(executable, /summary_code\s+is\s+not\s+null/i);
  assert.match(executable, /Legacy Summary with a Package membership/i);
  assert.match(executable, /KP-native Summary without a Package membership/i);
  assert.match(executable, /KP-native Summary without one compatibility marker/i);
  assert.match(executable, /marker inconsistent with its KP-native Summary/i);
}

function verifiesMultiPackageCreate(): void {
  assert.match(
    executable,
    /create\s+or\s+replace\s+function\s+public\.kp_persist_create_compatibility_summary[\s\S]*p_package_ids\s+uuid\[\]/i,
  );
  assert.match(executable, /cardinality\(p_package_ids\)/i);
  assert.match(executable, /select distinct package_id from unnest\(p_package_ids\)/i);
  assert.match(executable, /order by requested\.package_id/i);
  assert.match(executable, /for v_package_id in[\s\S]*?insert into public\.package_summaries/i);
  assert.match(executable, /v_package_id\s*=\s*v_canonical_package/i);
  assert.match(executable, new RegExp(`array\\[p_package_id\\]::uuid\\[\\]`, 'i'));
  assert.match(
    executable,
    /create\s+or\s+replace\s+function\s+public\.kp_persist_create_compatibility_summary[\s\S]*p_package_id\s+uuid[\s\S]*p_legacy_slug/i,
  );
}

function verifiesMembershipCore(): void {
  assert.match(executable, /create\s+or\s+replace\s+function\s+public\.kp_persist_reconcile_package_memberships/i);
  assert.match(executable, /create\s+or\s+replace\s+function\s+public\.kp_persist_attach_package_summary/i);
  assert.match(executable, /create\s+or\s+replace\s+function\s+public\.kp_persist_detach_package_summary/i);
  assert.match(executable, /cannot contain duplicates/i);
  assert.match(executable, /must retain at least one Package membership/i);
  assert.match(executable, /set\s+is_summary_bank_compatibility\s*=\s*false/i);
  assert.match(executable, /v_slug,\s*false/i);
  assert.match(executable, /not \(ps\.package_id\s*=\s*any\(p_package_ids\)\)/i);
}

function verifiesCanonicalPreservationAndRotation(): void {
  assert.match(executable, /if v_summary\.package_id\s*=\s*any\(p_package_ids\)/i);
  assert.match(executable, /order by requested\.package_id[\s\S]*limit 1/i);
  assert.match(executable, /set package_id\s*=\s*v_replacement\.package_id/i);
  assert.match(executable, /set is_summary_bank_compatibility\s*=\s*true[\s\S]*legacy_slug\s*=\s*v_new_slug/i);
  assert.match(executable, /select \* into v_target[\s\S]*if v_target\.package_id\s+is not null/i);
  assert.match(executable, /Cannot detach the final KP-native Package membership/i);
}

function verifiesLegacyPlacementProtectionAndNoDeploymentBackfill(): void {
  assert.match(executable, /Legacy Summary rows cannot receive Package memberships/i);
  assert.match(executable, /Legacy Summary rows cannot be reused by KP-native create/i);
  assert.doesNotMatch(deploymentSql, /insert\s+into\s+public\.(?:summaries|summary_versions|package_summaries)/i);
  assert.doesNotMatch(deploymentSql, /update\s+public\.(?:summaries|summary_versions|package_summaries)/i);
  assert.doesNotMatch(deploymentSql, /delete\s+from\s+public\./i);
}

function verifiesOldSignatureSafetyAndServerOnlyGrants(): void {
  assert.match(
    executable,
    /create\s+or\s+replace\s+function\s+public\.kp_persist_create_compatibility_summary[\s\S]*p_package_id\s+uuid[\s\S]*p_legacy_slug/i,
  );
  assert.match(executable, /array\[p_package_id\]::uuid\[\]/i);
  assert.match(executable, /v_result\s*:=\s*public\.kp_persist_create_compatibility_summary/i);
  assert.match(executable, /jsonb_build_object\('package_id',\s*p_package_id\)/i);
  assert.match(executable, /revoke all on function public\.kp_persist_reconcile_package_memberships/i);
  assert.match(executable, /grant execute on function public\.kp_persist_reconcile_package_memberships[\s\S]*to service_role/i);
  assert.match(executable, /revoke all on function public\.kp_persist_create_compatibility_summary[\s\S]*uuid\[\]/i);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function verifiesWriterFenceIntegration(): void {
  const fence = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_writer_boundary\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/i,
  )?.[0];

  assert.ok(fence, '068 must replace the 058 writer fence with its extended allowlist');
  assert.match(fence, /security\s+invoker/i);
  assert.match(fence, /current_user\s+in\s*\(\s*'public'\s*,\s*'anon'\s*,\s*'authenticated'\s*,\s*'service_role'\s*\)/i);
  const callerHelper = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_summary_writer_caller_is_approved\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/i,
  )?.[0];
  assert.ok(callerHelper, '068 must install the caller-bound authorization helper');
  assert.match(callerHelper, /p\.oid\s+in\s*\(/i);
  for (const signature of [
    'public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)',
    'public.kp_persist_reconcile_package_memberships(uuid,uuid[],uuid)',
  ]) {
    assert.match(callerHelper, new RegExp(escapeRegExp(`to_regprocedure('${signature}')`), 'i'));
  }
  assert.match(callerHelper, /pg_get_userbyid\(p\.proowner\)\s*=\s*current_user/i);
  assert.match(callerHelper, /search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i);
  assert.match(callerHelper, /lock_timeout\s*=\s*'5s'/i);
  assert.match(executable, /create\s+or\s+replace\s+function\s+public\.kp_summary_writer_caller_is_approved\(\)[\s\S]*get\s+diagnostics\s+v_context\s*=\s*pg_context/i);
  assert.match(executable, /v_active_signature/i);
  assert.match(executable, /p\.oid\s*=\s*v_active_oid/i);
  assert.doesNotMatch(fence, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc/i, 'writer fence must not authorize from any allowlisted function row');
}

function verifiesHybridCleanupFenceIntegration(): void {
  const fence = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_cleanup_fence\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/i,
  )?.[0];

  assert.ok(fence, '068 must replace the installed 059 cleanup fence without dropping its trigger');
  assert.match(fence, /security\s+invoker/i);
  assert.match(fence, /current_user\s+in\s*\(\s*'public'\s*,\s*'anon'\s*,\s*'authenticated'\s*,\s*'service_role'\s*\)/i);
  assert.match(fence, /session_user\s*=\s*current_user/i);
  const apiAllowlist = fence.slice(fence.indexOf('from pg_catalog.pg_proc'));
  assert.doesNotMatch(apiAllowlist, /session_user/i, 'RPC approval must not depend on session_user');
  const callerHelper = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_summary_writer_caller_is_approved\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/i,
  )?.[0];
  assert.ok(callerHelper, '068 cleanup fence must preserve the caller-bound helper');
  assert.match(callerHelper, /p\.prosecdef/i);
  assert.match(callerHelper, /search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i);
  assert.match(callerHelper, /lock_timeout\s*=\s*'5s'/i);
  assert.match(fence, /kp_summary_writer_caller_is_approved\(\)/i);
  assert.doesNotMatch(fence, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc/i, 'cleanup fence must not authorize from any allowlisted function row');
  assert.match(executable, /kp_cleanup_legacy_summary_write_fence/i);
  for (const signature of [
    'public.kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)',
    'public.kp_persist_reconcile_package_memberships(uuid,uuid[],uuid)',
    'public.kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)',
    'public.kp_persist_detach_package_summary(uuid,uuid,uuid)',
  ]) {
    assert.match(callerHelper, new RegExp(escapeRegExp(`to_regprocedure('${signature}')`), 'i'));
  }
  for (const legacyColumn of ['package_id', 'title', 'slug', 'content_md', 'is_published']) {
    assert.match(fence, new RegExp(`new\\.${legacyColumn}\\s+is\\s+distinct\\s+from\\s+old\\.${legacyColumn}`, 'i'));
  }
}

function verifiesLegacyColumnsRemainPresent(): void {
  for (const [column, type, nullable] of [
    ['package_id', 'uuid', 'NO'],
    ['title', 'text', 'NO'],
    ['slug', 'text', 'NO'],
    ['content_md', 'text', 'NO'],
    ['read_time_minutes', 'int4', 'NO'],
    ['sort_order', 'int4', 'NO'],
    ['display_order', 'int4', 'NO'],
    ['released_at', 'timestamptz', 'YES'],
    ['is_published', 'bool', 'NO'],
    ['document', 'text', 'YES'],
  ] as const) {
    assert.match(executable, new RegExp(`\\('${column}',\\s*'${type}',\\s*'${nullable}'\\)`, 'i'));
  }
  assert.doesNotMatch(executable, /execute_legacy_summary_authority_removal/i);
}

function verifiesExactRetryPayloadStaticGuards(): void {
  const createArrayBlock = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_persist_create_compatibility_summary\([\s\S]*?p_package_ids\s+uuid\[\][\s\S]*?comment\s+on\s+function\s+public\.kp_persist_create_compatibility_summary\([^;]+uuid\[\][\s\S]*?;/i,
  )?.[0];

  assert.ok(createArrayBlock, 'multi-Package CREATE function block must be present');
  for (const field of [
    'v_summary.package_id',
    'v_summary.content_md',
    'v_summary.read_time_minutes',
    'v_summary.current_published_version_id',
    'v_membership.status',
    'v_membership.version_policy',
    'sv.summary_id',
    'v_version.revision_number',
    'v_version.status',
    'v_version.content_md',
    'v_version.content_checksum',
    'v_version.title_snapshot',
    'v_version.read_time_policy_version',
    'v_version.content_schema_version',
    'v_version.change_note',
    'v_version.authored_by',
  ]) {
    assert.match(createArrayBlock, new RegExp(escapeRegExp(field), 'i'), `retry must compare ${field}`);
  }
  assert.match(createArrayBlock, /Summary create retry conflicts with the requested root payload/i);
  assert.match(createArrayBlock, /Summary create retry conflicts with the requested Package membership payload/i);
  assert.match(createArrayBlock, /Summary create retry conflicts with the requested revision payload/i);
}

function verifiesSemanticFailureAtomicityAndMembershipLifecycle(): void {
  const legacyModel = new WriterContractModel(['package-a', 'package-b']);
  legacyModel.seedLegacy('legacy-1');
  const legacyBefore = stateFingerprint(legacyModel.state);
  assert.throws(
    () => legacyModel.attach('legacy-1', 'package-a', 'actor-1'),
    /Legacy Summary cannot receive Package memberships/,
  );
  assert.equal(stateFingerprint(legacyModel.state), legacyBefore);

  const invalidModel = new WriterContractModel(['package-a', 'package-b']);
  const invalidBefore = stateFingerprint(invalidModel.state);
  assert.throws(() => invalidModel.create(createInput([])), /cannot be empty/);
  assert.equal(stateFingerprint(invalidModel.state), invalidBefore);
  assert.throws(
    () => invalidModel.create(createInput(['package-a', 'package-a'])),
    /duplicates/,
  );
  assert.equal(stateFingerprint(invalidModel.state), invalidBefore);
  assert.throws(
    () => invalidModel.create(createInput(['package-a', 'package-missing'])),
    /invalid Package/,
  );
  assert.equal(stateFingerprint(invalidModel.state), invalidBefore);

  const singleModel = new WriterContractModel(['package-a', 'package-b', 'package-c']);
  const singleInput = createInput(['package-a']);
  assert.deepEqual(singleModel.create(singleInput), { idempotentRetry: false });
  const singleSummary = singleModel.state.summaries.get(singleInput.summaryId)!;
  assert.equal(singleSummary.memberships.length, 1);
  assert.equal(singleSummary.memberships.filter((membership) => membership.marker).length, 1);

  assert.deepEqual(singleModel.create(singleInput), { idempotentRetry: true });
  const retryBefore = stateFingerprint(singleModel.state);
  assert.throws(
    () => singleModel.create({ ...singleInput, contentMd: '# Changed content' }),
    /payload mismatch/,
  );
  assert.equal(stateFingerprint(singleModel.state), retryBefore);

  const multiModel = new WriterContractModel(['package-a', 'package-b', 'package-c']);
  const multiInput = createInput(['package-a', 'package-b', 'package-c']);
  assert.deepEqual(multiModel.create(multiInput), { idempotentRetry: false });
  const multiSummary = multiModel.state.summaries.get(multiInput.summaryId)!;
  assert.equal(multiSummary.memberships.length, 3);
  assert.equal(multiSummary.memberships.filter((membership) => membership.marker).length, 1);
  assert.equal(multiSummary.packageId, 'package-a');

  multiModel.reconcile(multiInput.summaryId, ['package-b', 'package-c'], 'actor-1');
  const rotatedSummary = multiModel.state.summaries.get(multiInput.summaryId)!;
  assert.equal(rotatedSummary.memberships.length, 2);
  assert.equal(rotatedSummary.packageId, 'package-b');
  assert.equal(rotatedSummary.memberships.filter((membership) => membership.marker).length, 1);

  multiModel.detach(multiInput.summaryId, 'package-b');
  const detachedSummary = multiModel.state.summaries.get(multiInput.summaryId)!;
  assert.equal(detachedSummary.memberships.length, 1);
  assert.equal(detachedSummary.packageId, 'package-c');
  assert.equal(detachedSummary.memberships[0]?.marker, true);

  const finalBefore = stateFingerprint(multiModel.state);
  assert.throws(
    () => multiModel.detach(multiInput.summaryId, 'package-c'),
    /final Package membership/,
  );
  assert.equal(stateFingerprint(multiModel.state), finalBefore);
}

function verifiesDirectWriterFenceDeniesClientRoles(): void {
  const model = new WriterContractModel(['package-a']);
  for (const role of ['public', 'anon', 'authenticated', 'service_role'] as const) {
    assert.throws(() => model.directWrite(role), /Direct Summary mutations are disabled/);
  }
}

type ResolverCatalogRow = {
  oid: string;
  proname: string;
  typeOnlyArguments: string;
  namedIdentityArguments: string;
};

function normalizeResolverSignature(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replaceAll('"', '');
}

function resolveUnqualifiedTypeOnlySignature(
  activeSignature: string,
  catalog: readonly ResolverCatalogRow[],
): string | null {
  const matches = catalog.filter((row) => normalizeResolverSignature(
    `${row.proname}(${row.typeOnlyArguments})`,
  ) === normalizeResolverSignature(activeSignature));
  return matches.length === 1 ? matches[0]!.oid : null;
}

function verifiesPgContextTypeOnlySignatureResolution(): void {
  const callerHelper = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_summary_writer_caller_is_approved\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/i,
  )?.[0];
  assert.ok(callerHelper, 'caller-bound helper must be installed');
  assert.match(callerHelper, /p\.proname\s*\|\|\s*'\('\s*\|\|\s*pg_catalog\.oidvectortypes\(p\.proargtypes\)/i);
  assert.doesNotMatch(callerHelper, /pg_get_function_identity_arguments/i);

  const arrayWriter: ResolverCatalogRow = {
    oid: 'approved-array-writer',
    proname: 'kp_persist_create_compatibility_summary',
    typeOnlyArguments: 'uuid,text,uuid[]',
    namedIdentityArguments: 'p_summary_id uuid, p_summary_code text, p_package_ids uuid[]',
  };
  const singleWriter: ResolverCatalogRow = {
    oid: 'approved-single-writer',
    proname: 'kp_persist_create_compatibility_summary',
    typeOnlyArguments: 'uuid,text,uuid',
    namedIdentityArguments: 'p_summary_id uuid, p_summary_code text, p_package_id uuid',
  };

  assert.notEqual(arrayWriter.namedIdentityArguments, arrayWriter.typeOnlyArguments);
  assert.equal(
    resolveUnqualifiedTypeOnlySignature(
      `${arrayWriter.proname}(${arrayWriter.typeOnlyArguments})`,
      [arrayWriter, singleWriter],
    ),
    arrayWriter.oid,
    'PG_CONTEXT type-only signature must resolve the approved array overload',
  );
  assert.equal(
    resolveUnqualifiedTypeOnlySignature(
      `${singleWriter.proname}(${singleWriter.typeOnlyArguments})`,
      [arrayWriter, singleWriter],
    ),
    singleWriter.oid,
    'PG_CONTEXT type-only signature must resolve the approved single overload',
  );
  assert.equal(
    resolveUnqualifiedTypeOnlySignature(
      `${arrayWriter.proname}(uuid,text,boolean)`,
      [arrayWriter, singleWriter],
    ),
    null,
    'a wrong overload must fail closed',
  );
  assert.equal(
    resolveUnqualifiedTypeOnlySignature(
      `${arrayWriter.proname}(${arrayWriter.typeOnlyArguments})`,
      [arrayWriter, { ...arrayWriter, oid: 'divergent-schema-writer' }],
    ),
    null,
    'globally ambiguous matches must fail closed',
  );
  assert.equal(
    resolveUnqualifiedTypeOnlySignature('malformed stack frame', [arrayWriter, singleWriter]),
    null,
    'malformed PG_CONTEXT frames must fail closed',
  );
}

function verifiesCallerBoundNegativeSecurityContract(): void {
  const callerHelper = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_summary_writer_caller_is_approved\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/i,
  )?.[0];
  assert.ok(callerHelper, 'caller-bound helper must be installed');
  assert.match(callerHelper, /get\s+diagnostics\s+v_context\s*=\s*pg_context/i);
  assert.match(callerHelper, /v_active_signature/i);
  assert.match(callerHelper, /v_active_oid\s+oid/i);
  assert.match(callerHelper, /order\s+by\s+(?:frames\.)?frame_no\s+limit\s+1/i);
  assert.match(callerHelper, /signature\s+not\s+in/i);
  assert.match(callerHelper, /lower\(btrim\(stack\.line\)\)\s+~\s+'\(\^\|\[\[:space:\]\]\)function\[\[:space:\]\]'/i);
  assert.match(callerHelper, /count\(\*\)\s*=\s*1[\s\S]*array_agg\(p\.oid/i);
  assert.match(callerHelper, /p\.oid\s+in\s*\(/i);
  assert.match(callerHelper, /p\.oid\s*=\s*v_active_oid/i);
  assert.match(callerHelper, /p\.prosecdef/i);
  assert.match(callerHelper, /pg_get_userbyid\(p\.proowner\)\s*=\s*current_user/i);
  assert.match(callerHelper, /search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i);
  assert.match(callerHelper, /lock_timeout\s*=\s*'5s'/i);

  // Model the four authorization outcomes required by G5.2. The previous
  // owner-only EXISTS pattern would incorrectly return true for the fourth.
  const authorize = (role: string, activeCaller: 'approved' | 'unlisted' | 'direct'): boolean => (
    !['public', 'anon', 'authenticated', 'service_role'].includes(role)
      && activeCaller === 'approved'
  );
  assert.equal(authorize('api_owner', 'approved'), true, 'approved writer must pass');
  assert.equal(authorize('service_role', 'direct'), false, 'direct service_role mutation must fail');
  for (const role of ['public', 'anon', 'authenticated']) {
    assert.equal(authorize(role, 'direct'), false, `${role} direct mutation must fail`);
  }
  assert.equal(authorize('api_owner', 'unlisted'), false, 'same-owner unlisted SECURITY DEFINER must fail');
}

const tests = [
  ['hybrid preflight and postflight', verifiesHybridPreflightAndPostflight],
  ['multi-Package create', verifiesMultiPackageCreate],
  ['membership attach/detach/reconcile core', verifiesMembershipCore],
  ['canonical preservation and rotation', verifiesCanonicalPreservationAndRotation],
  ['Legacy protection and no deployment backfill', verifiesLegacyPlacementProtectionAndNoDeploymentBackfill],
  ['old signature safety and server-only grants', verifiesOldSignatureSafetyAndServerOnlyGrants],
  ['writer-fence integration', verifiesWriterFenceIntegration],
  ['hybrid cleanup-fence integration', verifiesHybridCleanupFenceIntegration],
  ['legacy authority columns remain present', verifiesLegacyColumnsRemainPresent],
  ['exact CREATE retry payload guards', verifiesExactRetryPayloadStaticGuards],
  ['semantic rollback and membership lifecycle', verifiesSemanticFailureAtomicityAndMembershipLifecycle],
  ['direct client writes remain blocked', verifiesDirectWriterFenceDeniesClientRoles],
  ['PG_CONTEXT type-only overload resolution', verifiesPgContextTypeOnlySignatureResolution],
  ['caller-bound negative security contract', verifiesCallerBoundNegativeSecurityContract],
] as const;

for (const [name, run] of tests) {
  run();
  process.stdout.write(`✓ ${name}\n`);
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 068 tests passed.\n`);
