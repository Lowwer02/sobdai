/**
 * Contract tests for migration 069's hybrid publication boundary.
 *
 * The repository has no local PostgreSQL/Supabase runtime. Static SQL guards
 * are paired with a small transactional model so failure rollback and the
 * legacy/KP-native publication split are exercised without claiming runtime
 * database execution.
 *
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_069.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(migrationDir, '069_kp_summary_bank_compatibility_publication.sql'),
  'utf8',
);
const executable = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');
const deploymentSql = executable.replace(
  /create\s+(?:or\s+replace\s+)?function[\s\S]*?\$function\$;/gi,
  '',
);

type Status = 'draft' | 'active' | 'hidden';

type Membership = {
  packageId: string;
  marker: boolean;
  status: Status;
  legacySlug: string | null;
};

type Revision = {
  id: string;
  status: 'draft' | 'published';
  sourceSnapshots: readonly string[];
  submitted: boolean;
  reviewed: boolean;
  published: boolean;
};

type Summary = {
  id: string;
  summaryCode: string | null;
  packageId: string;
  slug: string;
  isPublished: boolean;
  currentPublishedVersionId: string | null;
  revisions: Revision[];
  memberships: Membership[];
};

type State = Map<string, Summary>;

function cloneState(state: State): State {
  return new Map(
    [...state.entries()].map(([id, summary]) => [id, {
      ...summary,
      revisions: summary.revisions.map((revision) => ({
        ...revision,
        sourceSnapshots: [...revision.sourceSnapshots],
      })),
      memberships: summary.memberships.map((membership) => ({ ...membership })),
    }]),
  );
}

function fingerprint(state: State): string {
  return JSON.stringify([...state.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function assertKpInvariant(summary: Summary): void {
  if (summary.summaryCode === null) {
    assert.equal(summary.memberships.length, 0);
    assert.equal(summary.revisions.length, 0);
    assert.equal(summary.currentPublishedVersionId, null);
    return;
  }

  assert.ok(summary.memberships.length >= 1);
  assert.equal(summary.memberships.filter((membership) => membership.marker).length, 1);
  const marker = summary.memberships.find((membership) => membership.marker)!;
  assert.equal(marker.packageId, summary.packageId);
  assert.equal(marker.legacySlug, summary.slug);
}

function legacySummary(id: string): Summary {
  return {
    id,
    summaryCode: null,
    packageId: 'legacy-package',
    slug: 'legacy-summary',
    isPublished: false,
    currentPublishedVersionId: null,
    revisions: [],
    memberships: [],
  };
}

function kpSummary(id: string, packageCount: number): Summary {
  const packages = Array.from({ length: packageCount }, (_, index) => `package-${index + 1}`);
  return {
    id,
    summaryCode: 'SUM-000001',
    packageId: packages[0]!,
    slug: 'kp-summary',
    isPublished: false,
    currentPublishedVersionId: null,
    revisions: [{
      id: `${id}-version-1`,
      status: 'draft',
      sourceSnapshots: ['source-1', 'source-2'],
      submitted: false,
      reviewed: false,
      published: false,
    }],
    memberships: packages.map((packageId, index) => ({
      packageId,
      marker: index === 0,
      status: 'draft',
      legacySlug: 'kp-summary',
    })),
  };
}

class PublicationModel {
  public state: State = new Map();

  private transaction<T>(operation: () => T): T {
    const before = cloneState(this.state);
    try {
      return operation();
    } catch (error) {
      this.state = before;
      throw error;
    }
  }

  public seed(summary: Summary): void {
    this.state.set(summary.id, summary);
    assertKpInvariant(summary);
  }

  public publishLegacy(summaryId: string): void {
    this.transaction(() => {
      const summary = this.state.get(summaryId);
      if (!summary) throw new Error('Summary does not exist');
      if (summary.summaryCode !== null) throw new Error('KP-native Summary must use KP publication');
      if (summary.memberships.length !== 0) throw new Error('Legacy Summary has Package membership');
      summary.isPublished = true;
      assertKpInvariant(summary);
    });
  }

  public unpublishLegacy(summaryId: string): void {
    this.transaction(() => {
      const summary = this.state.get(summaryId);
      if (!summary) throw new Error('Summary does not exist');
      if (summary.summaryCode !== null) throw new Error('KP-native Summary must use KP unpublish');
      if (summary.memberships.length !== 0) throw new Error('Legacy Summary has Package membership');
      summary.isPublished = false;
      assertKpInvariant(summary);
    });
  }

  public publish(summaryId: string, versionId: string): void {
    this.transaction(() => {
      const summary = this.state.get(summaryId);
      if (!summary) throw new Error('Summary does not exist');
      if (summary.summaryCode === null) throw new Error('Legacy Summary cannot enter KP publication');
      assertKpInvariant(summary);
      const revision = summary.revisions.find((candidate) => candidate.id === versionId);
      if (!revision) throw new Error('Revision does not belong to Summary');

      if (revision.status === 'published') {
        if (summary.currentPublishedVersionId !== versionId || !revision.published) {
          throw new Error('Published revision pointer/audit is inconsistent');
        }
        if (summary.isPublished) {
          if (summary.memberships.some((membership) => membership.status !== 'active')) {
            throw new Error('Published Summary has a non-active membership');
          }
          return;
        }
        if (summary.memberships.some((membership) => membership.status !== 'hidden')) {
          throw new Error('Republish requires all memberships hidden');
        }
        summary.isPublished = true;
        summary.memberships.forEach((membership) => { membership.status = 'active'; });
        assertKpInvariant(summary);
        return;
      }

      if (revision.status !== 'draft' || revision.submitted || revision.reviewed) {
        throw new Error('Revision is not an editable publication candidate');
      }
      revision.submitted = true;
      revision.reviewed = true;
      revision.published = true;
      revision.status = 'published';
      summary.currentPublishedVersionId = versionId;
      summary.isPublished = true;
      summary.memberships.forEach((membership) => { membership.status = 'active'; });
      assertKpInvariant(summary);
    });
  }

  public unpublish(summaryId: string): void {
    this.transaction(() => {
      const summary = this.state.get(summaryId);
      if (!summary) throw new Error('Summary does not exist');
      if (summary.summaryCode === null) throw new Error('Legacy Summary cannot enter KP unpublish');
      assertKpInvariant(summary);
      const versionId = summary.currentPublishedVersionId;
      if (versionId === null) throw new Error('No current published revision');
      const revision = summary.revisions.find((candidate) => candidate.id === versionId);
      if (!revision || revision.status !== 'published' || !revision.published) {
        throw new Error('Current revision publication state is invalid');
      }
      if (!summary.isPublished && summary.memberships.every((membership) => membership.status === 'hidden')) {
        return;
      }
      if (!summary.isPublished || summary.memberships.some((membership) => membership.status !== 'active')) {
        throw new Error('Summary/membership publication state is inconsistent');
      }
      summary.isPublished = false;
      summary.memberships.forEach((membership) => { membership.status = 'hidden'; });
      assertKpInvariant(summary);
    });
  }
}

function verifiesHybridStaticContract(): void {
  assert.match(executable, /summary_code\s+is\s+null/i);
  assert.match(executable, /summary_code\s+is\s+not\s+null/i);
  assert.match(executable, /Legacy Summary publication requires zero PackageSummary placements/i);
  assert.match(executable, /KP-native Summary without Package membership/i);
  assert.match(executable, /KP-native marker cardinality/i);
  assert.match(executable, /requires_marker/);
  assert.doesNotMatch(
    executable,
    /from\s+public\.summaries\s+s\s+where\s*\(\s*select\s+count\(\*\)[\s\S]*?is_summary_bank_compatibility[\s\S]*?\)\s*<>\s*1/i,
  );
  assert.doesNotMatch(deploymentSql, /(?:insert\s+into|update|delete\s+from)\s+public\.(?:summaries|summary_versions|package_summaries)\b/i);
}

function verifiesWriterFenceAndSecurityContract(): void {
  const fence = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_writer_boundary\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/i,
  )?.[0];
  assert.ok(fence, '069 must preserve and extend the 068 writer fence');
  assert.match(fence, /security\s+invoker/i);
  assert.match(fence, /current_user\s+in\s*\(\s*'public'\s*,\s*'anon'\s*,\s*'authenticated'\s*,\s*'service_role'\s*\)/i);
  assert.match(fence, /search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i);
  assert.match(fence, /lock_timeout\s*=\s*'5s'/i);
  assert.match(executable, /kp_summary_writer_caller_is_approved\(\)/i);
  assert.doesNotMatch(fence, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc/i, '069 writer fence must not use owner-only allowlist existence');
  assert.match(executable, /revoke all on function public\.kp_persist_publish_legacy_summary/i);
  assert.match(executable, /grant execute on function public\.kp_persist_unpublish_legacy_summary[\s\S]*to service_role/i);
}

function verifiesHybridCleanupFenceExtension(): void {
  const fence = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_cleanup_fence\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/i,
  )?.[0];
  assert.ok(fence, '069 must reassert the 068 cleanup fence');
  assert.match(fence, /security\s+invoker/i);
  assert.match(fence, /current_user\s+in\s*\(\s*'public'\s*,\s*'anon'\s*,\s*'authenticated'\s*,\s*'service_role'\s*\)/i);
  assert.match(fence, /session_user\s*=\s*current_user/i);
  assert.match(fence, /kp_summary_writer_caller_is_approved\(\)/i);
  assert.doesNotMatch(fence, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc/i, '069 cleanup fence must not use owner-only allowlist existence');
  const apiAllowlist = fence.slice(fence.indexOf('from pg_catalog.pg_proc'));
  assert.doesNotMatch(apiAllowlist, /session_user/i, 'RPC approval must not depend on session_user');
  for (const functionName of [
    'kp_persist_publish_compatibility_revision',
    'kp_persist_unpublish_compatibility_summary',
    'kp_persist_publish_legacy_summary',
    'kp_persist_unpublish_legacy_summary',
  ]) {
    assert.match(executable, new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${functionName}`, 'i'));
  }
  assert.match(executable, /kp_cleanup_legacy_summary_write_fence/i);
}

function verifiesCallerBoundNegativeSecurityContract(): void {
  assert.match(executable, /kp_summary_writer_caller_is_approved\(\)/i);
  assert.doesNotMatch(executable, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc[\s\S]*pg_get_userbyid\(p\.proowner\)\s*=\s*current_user/i);
  assert.match(executable, /caller-bound|active PG_CONTEXT/i);
}

function verifiesLegacyIsolation(): void {
  const model = new PublicationModel();
  const legacy = legacySummary('legacy-1');
  model.seed(legacy);
  model.publishLegacy(legacy.id);
  const afterPublish = model.state.get(legacy.id)!;
  assert.equal(afterPublish.isPublished, true);
  assert.equal(afterPublish.memberships.length, 0);
  assert.equal(afterPublish.revisions.length, 0);
  assert.equal(afterPublish.summaryCode, null);
  model.unpublishLegacy(legacy.id);
  assert.equal(model.state.get(legacy.id)!.isPublished, false);
  assert.throws(() => model.publish(legacy.id, 'version-1'), /Legacy Summary/);
}

function verifiesKpPublicationActivatesEveryMembership(): void {
  for (const packageCount of [1, 3]) {
    const model = new PublicationModel();
    const summary = kpSummary(`kp-${packageCount}`, packageCount);
    const revisionId = summary.revisions[0]!.id;
    model.seed(summary);
    model.publish(summary.id, revisionId);
    const published = model.state.get(summary.id)!;
    assert.equal(published.isPublished, true);
    assert.equal(published.currentPublishedVersionId, revisionId);
    assert.equal(published.revisions.length, 1);
    assert.equal(published.revisions[0]!.status, 'published');
    assert.deepEqual(published.revisions[0]!.sourceSnapshots, ['source-1', 'source-2']);
    assert.ok(published.memberships.every((membership) => membership.status === 'active'));
    assert.equal(published.memberships.filter((membership) => membership.marker).length, 1);
  }
}

function verifiesUnpublishAndRepublishPreserveHistoryAndMarker(): void {
  const model = new PublicationModel();
  const summary = kpSummary('kp-round-trip', 3);
  const revisionId = summary.revisions[0]!.id;
  model.seed(summary);
  model.publish(summary.id, revisionId);
  const published = model.state.get(summary.id)!;
  const markerPackage = published.memberships.find((membership) => membership.marker)!.packageId;
  const snapshots = [...published.revisions[0]!.sourceSnapshots];

  model.unpublish(summary.id);
  const hidden = model.state.get(summary.id)!;
  assert.equal(hidden.isPublished, false);
  assert.equal(hidden.currentPublishedVersionId, revisionId);
  assert.equal(hidden.revisions.length, 1);
  assert.deepEqual(hidden.revisions[0]!.sourceSnapshots, snapshots);
  assert.ok(hidden.memberships.every((membership) => membership.status === 'hidden'));
  assert.equal(hidden.memberships.find((membership) => membership.marker)!.packageId, markerPackage);

  model.publish(summary.id, revisionId);
  const republished = model.state.get(summary.id)!;
  assert.equal(republished.currentPublishedVersionId, revisionId);
  assert.equal(republished.revisions.length, 1);
  assert.ok(republished.memberships.every((membership) => membership.status === 'active'));
  assert.equal(republished.memberships.find((membership) => membership.marker)!.packageId, markerPackage);
}

function verifiesFailureRollbackAndNoGlobalLegacyAssumption(): void {
  const model = new PublicationModel();
  const summary = kpSummary('kp-failure', 3);
  const revisionId = summary.revisions[0]!.id;
  model.seed(summary);
  model.publish(summary.id, revisionId);

  const corrupt = model.state.get(summary.id)!;
  corrupt.memberships[1]!.status = 'draft';
  corrupt.isPublished = true;
  const before = fingerprint(model.state);
  assert.throws(() => model.publish(summary.id, revisionId), /non-active membership/);
  assert.equal(fingerprint(model.state), before);

  corrupt.memberships[1]!.status = 'active';
  const beforeBadVersion = fingerprint(model.state);
  assert.throws(() => model.unpublish('missing-summary'), /Summary does not exist/);
  assert.equal(fingerprint(model.state), beforeBadVersion);

  for (let index = 1; index <= 29; index += 1) {
    model.seed(legacySummary(`legacy-zero-placement-${index}`));
  }
  assert.equal(
    [...model.state.values()].filter((summary) => summary.summaryCode === null).length,
    29,
  );
  assert.equal(
    [...model.state.values()]
      .filter((summary) => summary.summaryCode === null)
      .reduce((total, summary) => total + summary.memberships.length, 0),
    0,
  );
}

const tests = [
  ['hybrid static contract and no historical DML', verifiesHybridStaticContract],
  ['writer fence and security contract', verifiesWriterFenceAndSecurityContract],
  ['hybrid cleanup-fence extension', verifiesHybridCleanupFenceExtension],
  ['legacy publication isolation', verifiesLegacyIsolation],
  ['KP publication activates every membership', verifiesKpPublicationActivatesEveryMembership],
  ['unpublish/republish preserves history and marker', verifiesUnpublishAndRepublishPreserveHistoryAndMarker],
  ['failure rollback and legacy starting state', verifiesFailureRollbackAndNoGlobalLegacyAssumption],
  ['caller-bound negative security contract', verifiesCallerBoundNegativeSecurityContract],
] as const;

for (const [name, run] of tests) {
  run();
  process.stdout.write(`✓ ${name}\n`);
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 069 tests passed.\n`);
