/**
 * Contract tests for migration 070's hybrid delete/archive boundary.
 *
 * The repository has no local PostgreSQL/Supabase runtime. Static SQL guards
 * are paired with an in-memory transactional model so legacy isolation,
 * multi-membership cleanup, archive preservation, and rollback are exercised
 * without claiming database execution.
 *
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_070.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const migration032 = readFileSync(
  join(migrationDir, '032_news_relations.sql'),
  'utf8',
);
const sql = readFileSync(
  join(migrationDir, '070_kp_summary_bank_compatibility_delete.sql'),
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

type Lifecycle = 'active' | 'archived';
type MembershipStatus = 'draft' | 'active' | 'hidden';
type RevisionStatus = 'draft' | 'published' | 'retired';

type Membership = {
  packageId: string;
  marker: boolean;
  status: MembershipStatus;
  legacySlug: string;
};

type Revision = {
  id: string;
  status: RevisionStatus;
  sourceSnapshots: readonly string[];
};

type Summary = {
  id: string;
  summaryCode: string | null;
  canonicalSlug: string | null;
  canonicalTitle: string | null;
  visibility: string | null;
  lifecycleStatus: Lifecycle | null;
  archivedBy: string | null;
  archivedAt: string | null;
  packageId: string;
  slug: string;
  isPublished: boolean;
  currentPublishedVersionId: string | null;
  revisions: Revision[];
  memberships: Membership[];
  aliases: number;
  liveSources: number;
  newsLinks: number;
};

type State = Map<string, Summary>;

type DeleteResult = {
  outcome: 'deleted' | 'archived';
  idempotentRetry: boolean;
};

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
  assert.notEqual(summary.summaryCode, null);
  assert.ok(summary.canonicalSlug);
  assert.ok(summary.canonicalTitle);
  assert.ok(summary.visibility);
  assert.ok(summary.lifecycleStatus);
  assert.ok(summary.memberships.length >= 1);
  assert.equal(summary.memberships.filter((membership) => membership.marker).length, 1);
  const marker = summary.memberships.find((membership) => membership.marker)!;
  assert.equal(marker.packageId, summary.packageId);
  assert.equal(marker.legacySlug, summary.slug);
  if (summary.lifecycleStatus === 'archived') {
    assert.equal(summary.archivedBy, 'actor-1');
    assert.equal(summary.archivedAt, 'archived-at');
  }
}

function legacySummary(id: string): Summary {
  return {
    id,
    summaryCode: null,
    canonicalSlug: null,
    canonicalTitle: null,
    visibility: null,
    lifecycleStatus: null,
    archivedBy: null,
    archivedAt: null,
    packageId: 'legacy-package',
    slug: 'legacy-summary',
    isPublished: false,
    currentPublishedVersionId: null,
    revisions: [],
    memberships: [],
    aliases: 0,
    liveSources: 0,
    newsLinks: 0,
  };
}

function kpSummary(
  id: string,
  packageCount: number,
  overrides: Partial<Pick<Summary, 'isPublished' | 'currentPublishedVersionId' | 'aliases' | 'liveSources' | 'newsLinks'>> = {},
): Summary {
  const packages = Array.from({ length: packageCount }, (_, index) => `package-${index + 1}`);
  const isPublished = overrides.isPublished ?? false;
  const currentPublishedVersionId = overrides.currentPublishedVersionId ?? null;
  return {
    id,
    summaryCode: 'SUM-000001',
    canonicalSlug: 'kp-summary-canonical',
    canonicalTitle: 'KP Summary',
    visibility: 'product_entitled',
    lifecycleStatus: 'active',
    archivedBy: null,
    archivedAt: null,
    packageId: packages[0]!,
    slug: 'kp-summary',
    isPublished,
    currentPublishedVersionId,
    revisions: [{
      id: `${id}-version-1`,
      status: isPublished ? 'published' : 'draft',
      sourceSnapshots: ['source-1', 'source-2'],
    }],
    memberships: packages.map((packageId, index) => ({
      packageId,
      marker: index === 0,
      status: isPublished ? 'active' : 'draft',
      legacySlug: 'kp-summary',
    })),
    aliases: overrides.aliases ?? 0,
    liveSources: overrides.liveSources ?? 0,
    newsLinks: overrides.newsLinks ?? 0,
  };
}

class DeleteModel {
  public state: State = new Map();
  private readonly newsDeleteAction: 'cascade' | 'restrict';

  public constructor(newsDeleteAction: 'cascade' | 'restrict' = 'cascade') {
    this.newsDeleteAction = newsDeleteAction;
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

  public seed(summary: Summary): void {
    this.state.set(summary.id, summary);
    if (summary.summaryCode !== null) assertKpInvariant(summary);
  }

  public delete(summaryId: string): DeleteResult {
    return this.transaction(() => {
      const summary = this.state.get(summaryId);
      if (!summary) throw new Error('Summary does not exist');

      if (summary.summaryCode === null) {
        if (
          summary.canonicalSlug !== null
          || summary.canonicalTitle !== null
          || summary.visibility !== null
          || summary.lifecycleStatus !== null
          || summary.currentPublishedVersionId !== null
          || summary.memberships.length !== 0
          || summary.revisions.length !== 0
          || summary.aliases !== 0
          || summary.liveSources !== 0
          || (summary.newsLinks !== 0 && this.newsDeleteAction === 'restrict')
        ) {
          throw new Error('Legacy Summary has unexpected Knowledge Platform state');
        }
        this.state.delete(summaryId);
        return { outcome: 'deleted', idempotentRetry: false };
      }

      assertKpInvariant(summary);
      if (summary.lifecycleStatus === 'archived') {
        if (summary.isPublished || summary.memberships.some((membership) => membership.status !== 'hidden')) {
          throw new Error('Archived Summary has divergent membership visibility');
        }
        return { outcome: 'archived', idempotentRetry: true };
      }

      if (summary.isPublished && summary.memberships.some((membership) => membership.status !== 'active')) {
        throw new Error('Published Summary has a non-active membership');
      }
      if (!summary.isPublished && summary.currentPublishedVersionId !== null
          && summary.memberships.some((membership) => membership.status !== 'hidden')) {
        throw new Error('Unpublished Summary has a non-hidden membership');
      }
      if (!summary.isPublished && summary.currentPublishedVersionId === null
          && summary.memberships.some((membership) => membership.status === 'active')) {
        throw new Error('Never-published Summary has an active membership');
      }

      const protectedHistory = summary.revisions.some(
        (revision) => revision.status === 'published' || revision.status === 'retired',
      );
      const hardDeleteEligible = !summary.isPublished
        && summary.currentPublishedVersionId === null
        && !protectedHistory
        && summary.aliases === 0
        && summary.liveSources === 0
        && summary.newsLinks === 0;

      if (hardDeleteEligible) {
        this.state.delete(summaryId);
        return { outcome: 'deleted', idempotentRetry: false };
      }

      summary.lifecycleStatus = 'archived';
      summary.archivedBy = 'actor-1';
      summary.archivedAt = 'archived-at';
      summary.isPublished = false;
      summary.memberships.forEach((membership) => { membership.status = 'hidden'; });
      assertKpInvariant(summary);
      return { outcome: 'archived', idempotentRetry: false };
    });
  }
}

function verifiesHybridStaticContract(): void {
  assert.match(
    migration032,
    /summary_id\s+uuid\s+references\s+public\.summaries\(id\)\s+on\s+delete\s+cascade/i,
    '032 must retain its live-compatible CASCADE News FK shape',
  );
  assert.match(executable, /summary_code\s+is\s+null/i);
  assert.match(executable, /summary_code\s+is\s+not\s+null/i);
  assert.match(executable, /confdeltype\s+in\s*\(\s*'c'\s*,\s*'r'\s*\)/i);
  assert.match(executable, /conname\s*=\s*'news_summaries_summary_id_fkey'/i);
  assert.doesNotMatch(executable, /Migration 060 deliberately changed the News FK/i);
  assert.doesNotMatch(executable, /execute_legacy_summary_authority_removal/i);
  assert.match(executable, /KP-native Summary delete\/archive requires exactly one marked/i);
  assert.match(executable, /v_news_link_count\s*=\s*0/i);
  const legacyDeleteBlock = executable.match(/if v_summary\.summary_code is null then[\s\S]*?end if;/i)?.[0];
  assert.ok(legacyDeleteBlock, '070 must retain an explicit Legacy delete branch');
  assert.doesNotMatch(legacyDeleteBlock, /news_summaries/i, 'Legacy News behavior must be governed by the actual FK');
  assert.doesNotMatch(executable, /is_summary_bank_compatibility\s*=\s*false/i);
  assert.doesNotMatch(
    executable,
    /from\s+public\.summaries\s+s\s+where\s*\(\s*select\s+count\(\*\)[\s\S]*?is_summary_bank_compatibility[\s\S]*?\)\s*<>\s*1/i,
  );
  assert.doesNotMatch(
    deploymentSql,
    /^\s*(?:insert\s+into|update|delete\s+from)\s+public\.(?:summaries|summary_versions|package_summaries)\b/im,
  );
}

function verifiesWriterFenceAndSecurityContract(): void {
  const fence = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_writer_boundary\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/i,
  )?.[0];
  assert.ok(fence, '070 must preserve and extend the 069 writer fence');
  assert.match(fence, /security\s+invoker/i);
  assert.match(fence, /current_user\s+in\s*\(\s*'public'\s*,\s*'anon'\s*,\s*'authenticated'\s*,\s*'service_role'\s*\)/i);
  assert.match(executable, /search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i);
  assert.match(executable, /lock_timeout\s*=\s*'5s'/i);
  assert.match(executable, /kp_summary_writer_caller_is_approved\(\)/i);
  assert.doesNotMatch(fence, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc/i, '070 writer fence must not use owner-only allowlist existence');
  assert.match(executable, /kp_persist_delete_compatibility_summary\(uuid,uuid\)/i);
  assert.match(executable, /create\s+function\s+public\.kp_persist_delete_compatibility_summary[\s\S]*?security\s+definer/i);
  assert.match(executable, /revoke all on function public\.kp_persist_delete_compatibility_summary/i);
  assert.match(executable, /grant execute on function public\.kp_persist_delete_compatibility_summary[\s\S]*to service_role/i);
}

function verifiesHybridCleanupFenceExtension(): void {
  const fence = executable.match(
    /create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_cleanup_fence\(\)[\s\S]*?\$function\$[\s\S]*?\$function\$/i,
  )?.[0];
  assert.ok(fence, '070 must reassert the 068/069 cleanup fence');
  assert.match(fence, /security\s+invoker/i);
  assert.match(fence, /current_user\s+in\s*\(\s*'public'\s*,\s*'anon'\s*,\s*'authenticated'\s*,\s*'service_role'\s*\)/i);
  assert.match(fence, /session_user\s*=\s*current_user/i);
  assert.match(executable, /active\s+PG_CONTEXT\s+caller/i);
  assert.match(fence, /kp_summary_writer_caller_is_approved\(\)/i);
  assert.doesNotMatch(fence, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc/i, '070 cleanup fence must not use owner-only allowlist existence');
  // The shared 068 helper owns the inherited allowlist; 070 must not
  // reintroduce a second owner-only catalog check.  Assert the local delete
  // writer is present while the inherited functions remain behind the helper.
  assert.match(executable, /create(?:\s+or\s+replace)?\s+function\s+public\.kp_persist_delete_compatibility_summary/i);
  assert.match(executable, /kp_summary_writer_caller_is_approved[\s\S]*kp_persist_delete_compatibility_summary/i);
  assert.match(executable, /kp_cleanup_legacy_summary_write_fence/i);
}

function verifiesCallerBoundNegativeSecurityContract(): void {
  assert.match(executable, /kp_summary_writer_caller_is_approved\(\)/i);
  assert.doesNotMatch(executable, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc[\s\S]*pg_get_userbyid\(p\.proowner\)\s*=\s*current_user/i);
  assert.match(executable, /caller-bound|active PG_CONTEXT/i);
}

function verifiesLegacyDeleteIsolation(): void {
  const model = new DeleteModel();
  for (let index = 1; index <= 29; index += 1) {
    model.seed(legacySummary(`legacy-${index}`));
  }
  const result = model.delete('legacy-1');
  assert.deepEqual(result, { outcome: 'deleted', idempotentRetry: false });
  assert.equal(model.state.size, 28);
  assert.ok([...model.state.values()].every((summary) => (
    summary.summaryCode === null
    && summary.memberships.length === 0
    && summary.revisions.length === 0
  )));

  for (const newsDeleteAction of ['cascade', 'restrict'] as const) {
    const referenced = new DeleteModel(newsDeleteAction);
    const referencedLegacy = legacySummary(`legacy-news-${newsDeleteAction}`);
    referencedLegacy.newsLinks = 1;
    referenced.seed(referencedLegacy);
    const before = fingerprint(referenced.state);
    if (newsDeleteAction === 'restrict') {
      assert.throws(() => referenced.delete(referencedLegacy.id));
      assert.equal(fingerprint(referenced.state), before);
    } else {
      assert.deepEqual(referenced.delete(referencedLegacy.id), { outcome: 'deleted', idempotentRetry: false });
      assert.equal(referenced.state.has(referencedLegacy.id), false);
      assert.equal(before.includes('legacy-news-cascade'), true);
    }
  }
}

function verifiesEligibleHardDelete(): void {
  for (const packageCount of [1, 3]) {
    const model = new DeleteModel();
    const summary = kpSummary(`eligible-${packageCount}`, packageCount);
    model.seed(summary);
    const result = model.delete(summary.id);
    assert.deepEqual(result, { outcome: 'deleted', idempotentRetry: false });
    assert.equal(model.state.has(summary.id), false);
  }
}

function verifiesUnsafeDeleteArchivesAndPreservesHistory(): void {
  for (const packageCount of [1, 3]) {
    const model = new DeleteModel();
    const summary = kpSummary(
      `published-${packageCount}`,
      packageCount,
      { isPublished: true, currentPublishedVersionId: `published-${packageCount}-version-1` },
    );
    model.seed(summary);
    const beforeRevision = JSON.stringify(summary.revisions);
    const beforeMarker = summary.memberships.find((membership) => membership.marker)!.packageId;
    const result = model.delete(summary.id);
    assert.deepEqual(result, { outcome: 'archived', idempotentRetry: false });
    const archived = model.state.get(summary.id)!;
    assert.equal(archived.lifecycleStatus, 'archived');
    assert.equal(archived.isPublished, false);
    assert.equal(archived.currentPublishedVersionId, summary.id + '-version-1');
    assert.equal(JSON.stringify(archived.revisions), beforeRevision);
    assert.ok(archived.memberships.every((membership) => membership.status === 'hidden'));
    assert.equal(archived.memberships.filter((membership) => membership.marker).length, 1);
    assert.equal(archived.memberships.find((membership) => membership.marker)!.packageId, beforeMarker);
    assert.equal(archived.packageId, archived.memberships.find((membership) => membership.marker)!.packageId);
    assert.equal(archived.slug, archived.memberships.find((membership) => membership.marker)!.legacySlug);
    assert.equal(archived.archivedBy, 'actor-1');
    assert.equal(archived.archivedAt, 'archived-at');
  }

  const referenced = new DeleteModel();
  const referencedSummary = kpSummary('referenced', 3, { liveSources: 1, newsLinks: 1 });
  referenced.seed(referencedSummary);
  assert.equal(referenced.delete(referencedSummary.id).outcome, 'archived');
  assert.equal(referenced.state.get(referencedSummary.id)!.liveSources, 1);
  assert.equal(referenced.state.get(referencedSummary.id)!.newsLinks, 1);
}

function verifiesArchiveRetryAndFailureRollback(): void {
  const model = new DeleteModel();
  const summary = kpSummary('retry', 3, { isPublished: true, currentPublishedVersionId: 'retry-version-1' });
  model.seed(summary);
  model.delete(summary.id);
  assert.deepEqual(model.delete(summary.id), { outcome: 'archived', idempotentRetry: true });

  const corrupt = new DeleteModel();
  const corruptSummary = kpSummary('corrupt', 3);
  corrupt.seed(corruptSummary);
  corruptSummary.memberships[1]!.marker = true;
  const before = fingerprint(corrupt.state);
  assert.throws(() => corrupt.delete(corruptSummary.id));
  assert.equal(fingerprint(corrupt.state), before);
}

const tests = [
  ['hybrid static contract and no historical DML', verifiesHybridStaticContract],
  ['writer fence and security contract', verifiesWriterFenceAndSecurityContract],
  ['hybrid cleanup-fence extension', verifiesHybridCleanupFenceExtension],
  ['legacy delete isolation and 29-row starting state', verifiesLegacyDeleteIsolation],
  ['eligible one/multi-membership hard delete', verifiesEligibleHardDelete],
  ['unsafe delete archives and preserves history', verifiesUnsafeDeleteArchivesAndPreservesHistory],
  ['archive retry and failure rollback', verifiesArchiveRetryAndFailureRollback],
  ['caller-bound negative security contract', verifiesCallerBoundNegativeSecurityContract],
] as const;

for (const [name, run] of tests) {
  run();
  process.stdout.write(`✓ ${name}\n`);
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 070 tests passed.\n`);
