/**
 * Contract tests for migration 071's hybrid Markdown import boundary.
 *
 * PostgreSQL/Supabase is intentionally not required here. Static SQL guards
 * cover the installed signatures, protected fences, and no-060 contract; the
 * small transactional model covers discriminator routing and rollback.
 *
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_071.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(migrationDir, '071_kp_summary_bank_compatibility_import.sql'),
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

const NEW_ARRAY_SIGNATURE = 'kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean)';
const NEW_SINGLE_SIGNATURE = 'kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean)';
const FROZEN_ARRAY_CREATE_SIGNATURE = 'kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)';
const REPLACE_SIGNATURE = 'kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)';
const RESOLVER_SIGNATURE = 'kp_persist_resolve_import_collision(uuid,text)';
const PROTECTED_071_SIGNATURES = [RESOLVER_SIGNATURE, NEW_ARRAY_SIGNATURE, NEW_SINGLE_SIGNATURE, REPLACE_SIGNATURE];

function extractFunction(start: RegExp): string {
  const match = executable.match(new RegExp(`${start.source}[\\s\\S]*?\\$function\\$;`, 'i'));
  assert.ok(match, `Expected function block matching ${start}`);
  return match[0]!;
}

function signaturePresent(signature: string): boolean {
  return executable.toLowerCase().includes(signature.toLowerCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function verifiesStaticHybridContract(): void {
  const preflightMatch = executable.match(/do\s+\$kp_compatibility_import_preflight\$[\s\S]*?\$kp_compatibility_import_preflight\$;/i);
  assert.ok(preflightMatch, 'expected 071 preflight block');
  const preflight = preflightMatch[0]!;
  const resolver = extractFunction(/create\s+function\s+public\.kp_persist_resolve_import_collision\s*\(/i);
  const importNew = extractFunction(/create\s+function\s+public\.kp_persist_create_compatibility_summary\s*\([\s\S]*?p_package_ids\s+uuid\[\]/i);
  const replace = extractFunction(/create\s+function\s+public\.kp_persist_replace_compatibility_summary\s*\(/i);
  const helper = extractFunction(/create\s+or\s+replace\s+function\s+public\.kp_summary_writer_caller_is_approved\s*\(/i);
  const writerFence = extractFunction(/create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_writer_boundary\s*\(/i);
  const cleanupFence = extractFunction(/create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_cleanup_fence\s*\(/i);

  for (const signature of [RESOLVER_SIGNATURE, NEW_ARRAY_SIGNATURE, NEW_SINGLE_SIGNATURE, REPLACE_SIGNATURE]) {
    assert.equal(signaturePresent(signature), true, `missing 071 RPC signature: ${signature}`);
  }

  const frozenArrayCall = `to_regprocedure('public.${FROZEN_ARRAY_CREATE_SIGNATURE}')`;
  assert.match(preflight, new RegExp(escapeRegExp(frozenArrayCall), 'i'));
  assert.match(preflight, new RegExp(
    `where\\s+p\\.oid\\s*=\\s*${escapeRegExp(frozenArrayCall)}[\\s\\S]*?p\\.prosecdef[\\s\\S]*?search_path=pg_catalog, public, pg_temp[\\s\\S]*?lock_timeout=5s`,
    'i',
  ));
  assert.match(preflight, new RegExp(
    `pg_catalog\\.pg_get_functiondef\\([\\s\\S]*${escapeRegExp(frozenArrayCall)}`,
    'i',
  ));
  assert.match(preflight, /v_frozen_create_owner\s+is\s+distinct\s+from\s+v_api_owner/i);

  assert.match(importNew, /summary_code\s+is\s+not\s+null/i);
  assert.match(importNew, /p_package_ids\s+uuid\[\]/i);
  assert.match(importNew, /cardinality\(p_package_ids\)/i);
  assert.match(importNew, /kp_persist_create_compatibility_summary\([\s\S]*p_package_ids[\s\S]*\)/i);
  assert.match(importNew, /is_summary_bank_compatibility/i);
  assert.match(importNew, /v_marker_count\s+<>\s+1/i);
  assert.doesNotMatch(importNew, /insert\s+into\s+public\.summaries\s*\([^)]*summary_code[\s\S]*?values\s*\([^)]*null/i);

  assert.match(resolver, /from\s+public\.summaries\s+s[\s\S]*s\.package_id\s*=\s*p_package_id[\s\S]*s\.slug\s*=\s*v_legacy_slug/i);
  assert.match(resolver, /from\s+public\.package_summaries\s+ps[\s\S]*ps\.package_id\s*=\s*p_package_id[\s\S]*ps\.legacy_slug\s*=\s*v_legacy_slug/i);
  assert.match(resolver, /union/i);
  const targetLookup = resolver.match(/into\s+v_target[\s\S]*?for\s+update/i)?.[0] ?? '';
  assert.notEqual(targetLookup, '', 'resolver must lock the matching membership');
  assert.doesNotMatch(targetLookup, /is_summary_bank_compatibility/i);
  assert.match(resolver, /cardinality_violation/i);

  const legacyBranchStart = replace.search(/if\s+v_summary\.summary_code\s+is\s+null\s+then/i);
  const legacyBranchEnd = replace.search(/if\s+v_collision\s*->>\s*'collision_kind'\s*<>\s*'kp_native'/i);
  const legacyBranch = legacyBranchStart >= 0 && legacyBranchEnd > legacyBranchStart
    ? replace.slice(legacyBranchStart, legacyBranchEnd)
    : '';
  assert.notEqual(legacyBranch, '', 'replace must have an explicit Legacy branch');
  assert.doesNotMatch(legacyBranch, /insert\s+into\s+public\.(?:package_summaries|summary_versions)/i);
  assert.match(legacyBranch, /kp_persist_publish_legacy_summary/i);
  assert.match(legacyBranch, /kp_persist_unpublish_legacy_summary/i);
  assert.match(replace, /collision_kind[\s\S]*legacy/i);
  assert.match(replace, /collision_kind[\s\S]*kp_native/i);
  assert.match(replace, /where\s+ps\.summary_id\s*=\s*p_summary_id[\s\S]*ps\.package_id\s*=\s*p_package_id[\s\S]*ps\.legacy_slug\s*=\s*v_legacy_slug/i);
  assert.match(replace, /kp_persist_assert_kp_summary_membership/i);

  for (const signature of PROTECTED_071_SIGNATURES) {
    assert.match(helper, new RegExp(signature.replace(/[()[\]]/g, '\\$&'), 'i'));
  }
  assert.match(helper, /pg_context/i);
  assert.match(helper, /v_active_oid/i);
  assert.match(helper, /p\.oid\s*=\s*v_active_oid/i);
  assert.match(helper, /pg_catalog\.oidvectortypes\(p\.proargtypes\)/i);
  assert.doesNotMatch(helper, /pg_get_function_identity_arguments/i);

  const assertEffectiveFenceAllowlist = (fence: string, label: string): void => {
    assert.match(fence, /security\s+invoker/i);
    assert.match(fence, /current_user\s+in\s*\(\s*'public'\s*,\s*'anon'\s*,\s*'authenticated'\s*,\s*'service_role'\s*\)/i);
    assert.match(fence, /kp_summary_writer_caller_is_approved\(\)/i);
    assert.match(fence, /search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i);
    assert.match(fence, /lock_timeout\s*=\s*'5s'/i);
    const effectiveAllowlist = `${fence}\n${helper}`;
    for (const signature of PROTECTED_071_SIGNATURES) {
      const exactCall = `to_regprocedure('public.${signature}')`;
      assert.match(
        effectiveAllowlist,
        new RegExp(escapeRegExp(exactCall), 'i'),
        `${label} effective allowlist is missing ${signature}`,
      );
    }
  };

  assertEffectiveFenceAllowlist(writerFence, '058 writer boundary');
  assertEffectiveFenceAllowlist(cleanupFence, '059 cleanup fence');
  assert.match(cleanupFence, /session_user\s*=\s*current_user/i);
  assert.match(sql, /approved\s+057,\s+068,\s+069,\s+070,\s+and\s+071/i);
  assert.doesNotMatch(writerFence, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc/i);
  assert.doesNotMatch(cleanupFence, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc/i);

  for (const signature of PROTECTED_071_SIGNATURES) {
    const escaped = signature.replace(/[()[\]]/g, '\\$&');
    assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${escaped}[\\s\\S]*?from\\s+public,\\s+anon,\\s+authenticated`, 'i'));
    assert.match(sql, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${escaped}[\\s\\S]*?to\\s+service_role`, 'i'));
  }

  assert.doesNotMatch(sql, /execute_legacy_summary_authority_removal/i);
  assert.doesNotMatch(sql, /supabase[\\/\\\\]migrations[\\/\\\\]060/i);
  assert.doesNotMatch(deploymentSql, /(?:insert\s+into|update|delete\s+from)\s+public\.(?:summaries|summary_versions|package_summaries)\b/i);
}

type Revision = {
  id: string;
  content: string;
  status: 'draft' | 'published';
};

type Membership = {
  packageId: string;
  legacySlug: string;
  marker: boolean;
  sortOrder: number;
};

type Summary = {
  id: string;
  summaryCode: string | null;
  packageId: string;
  slug: string;
  title: string;
  content: string;
  document: string | null;
  isPublished: boolean;
  revisions: Revision[];
  memberships: Membership[];
};

type Collision = {
  kind: 'legacy' | 'kp';
  summaryId: string;
  packageId: string;
  legacySlug: string;
  matchedIsMarker: boolean;
} | {
  kind: 'none';
  summaryId: null;
  packageId: string;
  legacySlug: string;
  matchedIsMarker: false;
};

type ReplaceInput = {
  summaryId: string;
  packageId: string;
  legacySlug: string;
  replacementVersionId: string | null;
  title: string;
  content: string;
  document: string | null;
  isPublished: boolean;
};

function cloneSummary(summary: Summary): Summary {
  return {
    ...summary,
    revisions: summary.revisions.map((revision) => ({ ...revision })),
    memberships: summary.memberships.map((membership) => ({ ...membership })),
  };
}

function cloneState(state: Map<string, Summary>): Map<string, Summary> {
  return new Map([...state.entries()].map(([id, summary]) => [id, cloneSummary(summary)]));
}

function fingerprint(state: Map<string, Summary>): string {
  return JSON.stringify([...state.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function assertLegacyInvariant(summary: Summary): void {
  assert.equal(summary.summaryCode, null);
  assert.equal(summary.revisions.length, 0);
  assert.equal(summary.memberships.length, 0);
}

function assertKpInvariant(summary: Summary): void {
  assert.notEqual(summary.summaryCode, null);
  assert.ok(summary.memberships.length >= 1);
  assert.equal(summary.memberships.filter((membership) => membership.marker).length, 1);
  const marker = summary.memberships.find((membership) => membership.marker)!;
  assert.equal(marker.packageId, summary.packageId);
  assert.equal(marker.legacySlug, summary.slug);
}

function makeLegacy(id: string, packageId: string, slug: string): Summary {
  return {
    id,
    summaryCode: null,
    packageId,
    slug,
    title: 'Legacy title',
    content: 'Legacy content',
    document: 'legacy document',
    isPublished: false,
    revisions: [],
    memberships: [],
  };
}

function makeKp(id: string, packageIds: string[], slug = 'kp-summary'): Summary {
  const canonicalPackageId = [...packageIds].sort()[0]!;
  return {
    id,
    summaryCode: 'SUM-071',
    packageId: canonicalPackageId,
    slug,
    title: 'KP title',
    content: 'KP content',
    document: 'kp document',
    isPublished: false,
    revisions: [{ id: `${id}-v1`, content: 'KP content', status: 'draft' }],
    memberships: packageIds.map((packageId) => ({
      packageId,
      legacySlug: slug,
      marker: packageId === canonicalPackageId,
      sortOrder: 0,
    })),
  };
}

class ImportModel {
  public state = new Map<string, Summary>();
  private readonly packages = new Set<string>();

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
    if (summary.summaryCode === null) assertLegacyInvariant(summary);
    else assertKpInvariant(summary);
    this.state.set(summary.id, cloneSummary(summary));
    this.packages.add(summary.packageId);
    for (const membership of summary.memberships) this.packages.add(membership.packageId);
  }

  public registerPackage(packageId: string): void {
    this.packages.add(packageId);
  }

  public resolve(packageId: string, legacySlug: string): Collision {
    if (!this.packages.has(packageId)) throw new Error('Package does not exist');
    const candidateIds = new Set<string>();
    for (const summary of this.state.values()) {
      if (summary.summaryCode === null
          && summary.packageId === packageId
          && summary.slug === legacySlug) {
        candidateIds.add(summary.id);
      }
      if (summary.memberships.some((membership) => (
        membership.packageId === packageId && membership.legacySlug === legacySlug
      ))) {
        candidateIds.add(summary.id);
      }
    }

    if (candidateIds.size === 0) {
      return { kind: 'none', summaryId: null, packageId, legacySlug, matchedIsMarker: false };
    }
    if (candidateIds.size !== 1) {
      throw new Error('ambiguous import collision');
    }

    const summary = this.state.get([...candidateIds][0]!)!;
    if (summary.summaryCode === null) {
      assertLegacyInvariant(summary);
      return { kind: 'legacy', summaryId: summary.id, packageId, legacySlug, matchedIsMarker: false };
    }

    assertKpInvariant(summary);
    const target = summary.memberships.find((membership) => (
      membership.packageId === packageId && membership.legacySlug === legacySlug
    ));
    if (!target) throw new Error('divergent KP collision');
    return {
      kind: 'kp',
      summaryId: summary.id,
      packageId,
      legacySlug,
      matchedIsMarker: target.marker,
    };
  }

  public importNew(
    summaryId: string,
    packageIds: string[],
    legacySlug: string,
  ): Summary {
    return this.transaction(() => {
      if (packageIds.length === 0) throw new Error('at least one Package ID is required');
      if (new Set(packageIds).size !== packageIds.length) throw new Error('duplicate Package ID');
      if (packageIds.some((packageId) => !this.packages.has(packageId))) {
        throw new Error('Package does not exist');
      }
      for (const packageId of packageIds) {
        const collision = this.resolve(packageId, legacySlug);
        if (collision.kind !== 'none') throw new Error('import-new collision');
      }
      const canonicalPackageId = [...packageIds].sort()[0]!;
      const summary: Summary = {
        id: summaryId,
        summaryCode: 'SUM-071',
        packageId: canonicalPackageId,
        slug: legacySlug,
        title: 'Imported title',
        content: 'Imported content',
        document: 'Imported document',
        isPublished: false,
        revisions: [{ id: `${summaryId}-v1`, content: 'Imported content', status: 'draft' }],
        memberships: packageIds.map((packageId) => ({
          packageId,
          legacySlug,
          marker: packageId === canonicalPackageId,
          sortOrder: 0,
        })),
      };
      this.state.set(summaryId, summary);
      assertKpInvariant(summary);
      return summary;
    });
  }

  public replace(input: ReplaceInput, options: { failAfterMutation?: boolean } = {}): Summary {
    return this.transaction(() => {
      const summary = this.state.get(input.summaryId);
      if (!summary) throw new Error('missing replacement target');
      const collision = this.resolve(input.packageId, input.legacySlug);
      if (collision.summaryId !== input.summaryId) throw new Error('replacement collision mismatch');

      if (summary.summaryCode === null) {
        if (input.replacementVersionId !== null) throw new Error('Legacy replacement cannot receive a KP revision');
        assertLegacyInvariant(summary);
        summary.title = input.title;
        summary.content = input.content;
        summary.document = input.document;
        summary.isPublished = input.isPublished;
        if (options.failAfterMutation) throw new Error('injected failure after mutation');
        assertLegacyInvariant(summary);
        return summary;
      }

      assert.equal(collision.kind, 'kp');
      assertKpInvariant(summary);
      const versionId = input.replacementVersionId ?? `${summary.id}-v${summary.revisions.length + 1}`;
      const existing = summary.revisions.find((revision) => revision.id === versionId);
      if (existing && existing.status !== 'draft') throw new Error('replacement revision is not editable');
      if (existing) {
        existing.content = input.content;
      } else {
        summary.revisions.push({ id: versionId, content: input.content, status: 'draft' });
      }
      summary.title = input.title;
      summary.content = input.content;
      summary.document = input.document;
      summary.isPublished = input.isPublished;
      const target = summary.memberships.find((membership) => (
        membership.packageId === input.packageId && membership.legacySlug === input.legacySlug
      ))!;
      target.sortOrder += 1;
      if (options.failAfterMutation) throw new Error('injected failure after mutation');
      assertKpInvariant(summary);
      return summary;
    });
  }
}

function verifiesImportNewIsKpNativeAndMultiPackage(): void {
  const model = new ImportModel();
  for (const packageId of ['package-a', 'package-b', 'package-c']) model.registerPackage(packageId);
  const created = model.importNew('new-kp', ['package-c', 'package-a', 'package-b'], 'new-summary');
  assert.equal(model.state.size, 1);
  assert.notEqual(created.summaryCode, null);
  assert.equal(created.revisions.length, 1);
  assert.equal(created.memberships.length, 3);
  assert.equal(created.memberships.filter((membership) => membership.marker).length, 1);
  assert.equal(created.packageId, 'package-a');
  assert.equal(created.slug, 'new-summary');
  assert.equal(created.memberships.every((membership) => membership.legacySlug === created.slug), true);
  assert.equal([...model.state.values()].filter((summary) => summary.summaryCode === null).length, 0);
}

function verifiesEmptyPackageInputRollsBack(): void {
  const model = new ImportModel();
  model.seed(makeLegacy('existing-empty', 'package-valid', 'existing-empty'));
  const before = fingerprint(model.state);

  assert.throws(
    () => model.importNew('new-empty', [], 'new-empty'),
    /at least one Package ID/i,
  );
  assert.equal(fingerprint(model.state), before);
}

function verifiesDuplicatePackageInputRollsBack(): void {
  const model = new ImportModel();
  model.seed(makeLegacy('existing-duplicate', 'package-valid', 'existing-duplicate'));
  const before = fingerprint(model.state);

  assert.throws(
    () => model.importNew('new-duplicate', ['package-valid', 'package-valid'], 'new-duplicate'),
    /duplicate Package ID/i,
  );
  assert.equal(fingerprint(model.state), before);
}

function verifiesInvalidPackageInputRollsBack(): void {
  const model = new ImportModel();
  model.seed(makeLegacy('existing-invalid', 'package-valid', 'existing-invalid'));
  const before = fingerprint(model.state);

  assert.throws(
    () => model.importNew('new-invalid', ['package-valid', 'package-missing'], 'new-invalid'),
    /Package does not exist/i,
  );
  assert.equal(fingerprint(model.state), before);
}

function verifiesCollisionLookupAndSharedSecondaryRouting(): void {
  const model = new ImportModel();
  const legacy = makeLegacy('legacy-1', 'package-legacy', 'legacy-slug');
  const kp = makeKp('kp-1', ['package-canonical', 'package-secondary'], 'shared-slug');
  model.seed(legacy);
  model.seed(kp);

  assert.deepEqual(model.resolve('package-legacy', 'legacy-slug'), {
    kind: 'legacy',
    summaryId: 'legacy-1',
    packageId: 'package-legacy',
    legacySlug: 'legacy-slug',
    matchedIsMarker: false,
  });
  const canonical = model.resolve('package-canonical', 'shared-slug');
  const secondary = model.resolve('package-secondary', 'shared-slug');
  assert.equal(canonical.kind, 'kp');
  assert.equal(secondary.kind, 'kp');
  assert.equal(canonical.summaryId, secondary.summaryId);
  assert.equal(canonical.matchedIsMarker, true);
  assert.equal(secondary.matchedIsMarker, false);
}

function verifiesLegacyReplaceIsolation(): void {
  const model = new ImportModel();
  model.seed(makeLegacy('legacy-replace', 'package-legacy', 'legacy-replace-slug'));
  const replaced = model.replace({
    summaryId: 'legacy-replace',
    packageId: 'package-legacy',
    legacySlug: 'legacy-replace-slug',
    replacementVersionId: null,
    title: 'Replaced Legacy title',
    content: 'Replaced Legacy content',
    document: 'Replaced Legacy document',
    isPublished: true,
  });
  assert.equal(replaced.summaryCode, null);
  assert.equal(replaced.memberships.length, 0);
  assert.equal(replaced.revisions.length, 0);
  assert.equal(replaced.packageId, 'package-legacy');
  assert.equal(replaced.slug, 'legacy-replace-slug');
  assert.equal(replaced.isPublished, true);
}

function verifiesKpReplacePreservesSharedAggregate(): void {
  const model = new ImportModel();
  model.seed(makeKp('kp-replace', ['package-a', 'package-b', 'package-c'], 'replace-slug'));
  const before = model.state.get('kp-replace')!;
  const beforeMemberships = JSON.stringify(before.memberships);
  const replaced = model.replace({
    summaryId: 'kp-replace',
    packageId: 'package-c',
    legacySlug: 'replace-slug',
    replacementVersionId: 'kp-replace-v2',
    title: 'Replaced KP title',
    content: 'Replaced KP content',
    document: 'Replaced KP document',
    isPublished: false,
  });
  assert.equal(replaced.id, 'kp-replace');
  assert.equal(replaced.revisions.length, 2);
  assert.equal(replaced.memberships.length, 3);
  assert.equal(replaced.memberships.filter((membership) => membership.marker).length, 1);
  assert.equal(replaced.packageId, 'package-a');
  assert.equal(replaced.slug, 'replace-slug');
  assert.notEqual(JSON.stringify(replaced.memberships), beforeMemberships);
  assert.equal(replaced.memberships.map((membership) => membership.packageId).sort().join(','), 'package-a,package-b,package-c');
  assert.equal(replaced.memberships.find((membership) => membership.marker)!.packageId, 'package-a');
}

function verifiesPostMutationFailureRollsBackCompletely(): void {
  const model = new ImportModel();
  model.seed(makeKp('kp-rollback', ['package-a', 'package-b'], 'rollback-slug'));
  const before = fingerprint(model.state);

  assert.throws(() => model.replace({
    summaryId: 'kp-rollback',
    packageId: 'package-b',
    legacySlug: 'rollback-slug',
    replacementVersionId: 'kp-rollback-v2',
    title: 'mutated title',
    content: 'mutated content',
    document: 'mutated document',
    isPublished: false,
  }, { failAfterMutation: true }), /injected failure after mutation/i);
  assert.equal(fingerprint(model.state), before);
  assertKpInvariant(model.state.get('kp-rollback')!);
}

function verifiesAmbiguousCollisionFailsClosedAndRollsBack(): void {
  const model = new ImportModel();
  model.seed(makeLegacy('legacy-conflict', 'package-conflict', 'same-slug'));
  model.seed(makeKp('kp-conflict', ['package-conflict'], 'same-slug'));
  const before = fingerprint(model.state);
  assert.throws(() => model.resolve('package-conflict', 'same-slug'), /ambiguous/i);
  assert.equal(fingerprint(model.state), before);
  assert.throws(() => model.replace({
    summaryId: 'legacy-conflict',
    packageId: 'package-conflict',
    legacySlug: 'same-slug',
    replacementVersionId: null,
    title: 'must fail',
    content: 'must fail',
    document: null,
    isPublished: false,
  }), /ambiguous/i);
  assert.equal(fingerprint(model.state), before);
}

function verifiesTwentyNineLegacyRowsRemainValid(): void {
  const model = new ImportModel();
  for (let index = 1; index <= 29; index += 1) {
    model.seed(makeLegacy(`legacy-${index}`, `package-${index}`, `legacy-${index}`));
  }
  assert.equal(model.state.size, 29);
  assert.equal([...model.state.values()].every((summary) => (
    summary.summaryCode === null
    && summary.memberships.length === 0
    && summary.revisions.length === 0
  )), true);
}

const tests = [
  ['static hybrid import, signature, and fence contract', verifiesStaticHybridContract],
  ['Import NEW is KP-native with one root, N memberships, and one marker', verifiesImportNewIsKpNativeAndMultiPackage],
  ['empty Package input fails without partial state', verifiesEmptyPackageInputRollsBack],
  ['duplicate Package input fails without partial state', verifiesDuplicatePackageInputRollsBack],
  ['invalid Package input fails without partial state', verifiesInvalidPackageInputRollsBack],
  ['Legacy/canonical/secondary collisions resolve by shared root', verifiesCollisionLookupAndSharedSecondaryRouting],
  ['Legacy REPLACE remains Legacy', verifiesLegacyReplaceIsolation],
  ['KP REPLACE preserves the shared aggregate and memberships', verifiesKpReplacePreservesSharedAggregate],
  ['post-mutation failure rolls back the complete transaction', verifiesPostMutationFailureRollsBackCompletely],
  ['ambiguous collision fails closed with rollback', verifiesAmbiguousCollisionFailsClosedAndRollsBack],
  ['29 Legacy rows retain zero KP placements', verifiesTwentyNineLegacyRowsRemainValid],
] as const;

for (const [name, run] of tests) {
  run();
  process.stdout.write(`✓ ${name}\n`);
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 071 tests passed.\n`);
