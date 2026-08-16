/**
 * Contract tests for migration 072's Hybrid Summary edit boundary.
 *
 * PostgreSQL/Supabase is intentionally not required here. Static SQL guards
 * cover the installed 072 signature, discriminator routing, both effective
 * fences, and no-060/no-deployment-DML safety. The transactional model covers
 * Legacy isolation, complete KP membership editing, canonical rotation, and
 * rollback.
 *
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_072.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(migrationDir, '072_kp_summary_bank_compatibility_edit.sql'),
  'utf8',
);
const writerCoreSql = readFileSync(
  join(migrationDir, '068_kp_summary_bank_compatibility_writer_core.sql'),
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

const EDIT_SIGNATURE = 'kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])';
const RECONCILE_SIGNATURE = 'kp_persist_reconcile_package_memberships(uuid,uuid[],uuid)';
const UPDATE_DRAFT_SIGNATURE = 'kp_persist_update_compatibility_draft(uuid,uuid,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,integer,integer,text)';
const HELPER_SIGNATURE = 'kp_summary_writer_caller_is_approved()';
const WRITER_FENCE_SIGNATURE = 'kp_enforce_summary_writer_boundary()';
const CLEANUP_FENCE_SIGNATURE = 'kp_enforce_summary_cleanup_fence()';

const EXISTING_APPROVED_SIGNATURES = [
  'kp_persist_require_actor(uuid)',
  'kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)',
  'kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text)',
  UPDATE_DRAFT_SIGNATURE,
  'kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)',
  'kp_persist_unpublish_compatibility_summary(uuid,uuid)',
  'kp_persist_publish_legacy_summary(uuid,uuid)',
  'kp_persist_unpublish_legacy_summary(uuid,uuid)',
  'kp_persist_retire_compatibility_revision(uuid,uuid,uuid,text,uuid)',
  'kp_persist_reassign_compatibility_package(uuid,uuid,text,uuid)',
  'kp_persist_replace_summary_sources(uuid,jsonb,uuid)',
  RECONCILE_SIGNATURE,
  'kp_persist_attach_package_summary(uuid,uuid,text,text,uuid,integer,integer,timestamptz,text,text,uuid)',
  'kp_persist_detach_package_summary(uuid,uuid,uuid)',
  'kp_persist_register_summary_alias(uuid,text,text,text,uuid)',
  'kp_persist_delete_compatibility_summary(uuid,uuid)',
  'kp_persist_resolve_import_collision(uuid,text)',
  'kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid[],text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean)',
  'kp_persist_create_compatibility_summary(uuid,text,text,text,text,text,text,text,uuid,text,text,text,integer,text,text,text,uuid,uuid,integer,integer,text,text,boolean)',
  'kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)',
];

function extractFunction(start: RegExp): string {
  const match = executable.match(new RegExp(`${start.source}[\\s\\S]*?\\$function\\$;`, 'i'));
  assert.ok(match, `Expected function block matching ${start}`);
  return match[0]!;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactCatalogCall(signature: string): RegExp {
  return new RegExp(escapeRegExp(`to_regprocedure('public.${signature}')`), 'i');
}

function verifiesStaticHybridEditContract(): void {
  const edit = extractFunction(/create\s+function\s+public\.kp_persist_update_compatibility_summary\s*\(/i);
  const helper = extractFunction(/create\s+or\s+replace\s+function\s+public\.kp_summary_writer_caller_is_approved\s*\(/i);
  const writerFence = extractFunction(/create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_writer_boundary\s*\(/i);
  const cleanupFence = extractFunction(/create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_cleanup_fence\s*\(/i);

  assert.ok(executable.toLowerCase().includes(EDIT_SIGNATURE.toLowerCase()), 'missing exact 072 uuid[] edit signature');
  assert.match(edit, /p_package_ids\s+uuid\[\]/i);
  assert.match(edit, /if\s+v_summary\.summary_code\s+is\s+null\s+then/i);
  assert.match(edit, /summary_code\s+is\s+not\s+null/i);
  assert.match(edit, /cardinality\(p_package_ids\)/i);
  assert.match(edit, /select\s+distinct\s+package_id\s+from\s+unnest\(p_package_ids\)/i);
  assert.match(edit, /left\s+join\s+public\.packages/i);
  assert.match(edit, /kp_persist_reconcile_package_memberships/i);
  assert.match(edit, /kp_persist_update_compatibility_draft\s*\(/i);
  assert.match(edit, /summary_version_reference_documents/i);
  assert.match(edit, /lifecycle_status\s+is\s+distinct\s+from\s+'active'/i);
  assert.match(edit, /status\s*=\s*'active'/i);
  assert.match(edit, /status\s*=\s*'hidden'/i);
  assert.match(edit, /status\s*=\s*'draft'/i);
  assert.match(edit, /status\s+<>\s+'active'/i);
  assert.match(edit, /status\s+<>\s+'hidden'/i);
  assert.match(edit, /status\s+<>\s+'draft'/i);
  for (const auditField of [
    'submitted_for_review_at',
    'reviewed_by',
    'reviewed_at',
    'published_by',
    'published_at',
  ]) {
    assert.match(edit, new RegExp(`v_current_version\\.${auditField}\\s+is\\s+null`, 'i'));
  }

  const legacyBranchStart = edit.search(/if\s+v_summary\.summary_code\s+is\s+null\s+then/i);
  const kpBranchStart = edit.search(/if\s+p_package_ids\s+is\s+null\s+or\s+cardinality\(p_package_ids\)/i);
  assert.ok(legacyBranchStart >= 0 && kpBranchStart > legacyBranchStart, 'expected explicit Legacy/KP branches');
  const legacyBranch = edit.slice(legacyBranchStart, kpBranchStart);
  const kpBranch = edit.slice(kpBranchStart);
  assert.doesNotMatch(legacyBranch, /kp_persist_reconcile_package_memberships/i);
  assert.doesNotMatch(legacyBranch, /insert\s+into\s+public\.(?:summary_versions|package_summaries)/i);
  assert.match(legacyBranch, /summary_code\s+is\s+null/i);
  assert.match(legacyBranch, /summary_version_id',\s+null/i);
  assert.match(kpBranch, /elsif\s+v_summary\.is_published/i);
  assert.doesNotMatch(kpBranch, /kp_persist_(?:publish|unpublish)_(?:compatibility|legacy)_summary/i);

  assert.match(edit, /where\s+id\s*=\s+p_summary_id\s+and\s+summary_code\s+is\s+not\s+null/i);
  assert.doesNotMatch(sql, /execute_legacy_summary_authority_removal/i);
  assert.doesNotMatch(sql, /supabase[\\/\\\\]migrations[\\/\\\\]060/i);
  assert.doesNotMatch(deploymentSql, /(?:insert\s+into|update|delete\s+from)\s+public\.(?:summaries|summary_versions|package_summaries)\b/i);

  assert.match(helper, /pg_context/i);
  assert.match(helper, /v_active_oid/i);
  assert.match(helper, /p\.oid\s*=\s*v_active_oid/i);
  assert.match(helper, /pg_catalog\.oidvectortypes\(p\.proargtypes\)/i);
  assert.doesNotMatch(helper, /pg_get_function_identity_arguments/i);
  assert.doesNotMatch(helper, /session_user/i);
  assert.match(helper, exactCatalogCall(EDIT_SIGNATURE));
  for (const signature of EXISTING_APPROVED_SIGNATURES) {
    assert.match(helper, exactCatalogCall(signature), `existing approved writer dropped: ${signature}`);
  }

  // The two assertions below intentionally remain independent. Each effective
  // fence is proved as its own boundary plus the shared helper it invokes.
  const writerEffectiveAllowlist = `${writerFence}\n${helper}`;
  assert.match(writerFence, /security\s+invoker/i);
  assert.match(writerFence, /kp_summary_writer_caller_is_approved\(\)/i);
  assert.match(writerFence, /current_user\s+in\s*\(\s*'public'\s*,\s*'anon'\s*,\s*'authenticated'\s*,\s*'service_role'/i);
  assert.match(writerFence, /session_user\s*=\s*current_user/i);
  assert.match(writerFence, /search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i);
  assert.match(writerFence, /lock_timeout\s*=\s*'5s'/i);
  assert.match(writerEffectiveAllowlist, exactCatalogCall(EDIT_SIGNATURE), '058 effective writer boundary lacks exact 072 signature');
  for (const signature of EXISTING_APPROVED_SIGNATURES) {
    assert.match(writerEffectiveAllowlist, exactCatalogCall(signature), `058 effective allowlist dropped ${signature}`);
  }

  const cleanupEffectiveAllowlist = `${cleanupFence}\n${helper}`;
  assert.match(cleanupFence, /security\s+invoker/i);
  assert.match(cleanupFence, /kp_summary_writer_caller_is_approved\(\)/i);
  assert.match(cleanupFence, /current_user\s+in\s*\(\s*'public'\s*,\s*'anon'\s*,\s*'authenticated'\s*,\s*'service_role'/i);
  assert.match(cleanupFence, /session_user\s*=\s*current_user/i);
  assert.match(cleanupFence, /search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i);
  assert.match(cleanupFence, /lock_timeout\s*=\s*'5s'/i);
  assert.match(cleanupEffectiveAllowlist, exactCatalogCall(EDIT_SIGNATURE), '059 effective cleanup fence lacks exact 072 signature');
  for (const signature of EXISTING_APPROVED_SIGNATURES) {
    assert.match(cleanupEffectiveAllowlist, exactCatalogCall(signature), `059 effective allowlist dropped ${signature}`);
  }

  assert.doesNotMatch(writerFence, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc/i);
  assert.doesNotMatch(cleanupFence, /select\s+exists\s*\([\s\S]*from\s+pg_catalog\.pg_proc/i);

  const authorize = (role: string, activeCaller: 'approved' | 'unlisted' | 'direct'): boolean => (
    !['public', 'anon', 'authenticated', 'service_role'].includes(role)
      && activeCaller === 'approved'
  );
  assert.equal(authorize('api_owner', 'approved'), true, 'approved caller must pass');
  assert.equal(authorize('service_role', 'direct'), false, 'direct service_role mutation must fail');
  for (const role of ['public', 'anon', 'authenticated']) {
    assert.equal(authorize(role, 'direct'), false, `${role} direct mutation must fail`);
  }
  assert.equal(authorize('api_owner', 'unlisted'), false, 'same-owner unlisted SECURITY DEFINER must fail');

  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.[\s\S]*?from\s+public,\s+anon,\s+authenticated/i);
  assert.match(sql, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${escapeRegExp(EDIT_SIGNATURE)}[\\s\\S]*?to\\s+service_role`, 'i'));
}

type Revision = {
  id: string;
  content: string;
  status: 'draft' | 'published' | 'in_review';
  sourceSnapshots: boolean;
};

type Membership = {
  packageId: string;
  legacySlug: string | null;
  marker: boolean;
  status: 'draft' | 'active' | 'hidden';
  sortOrder: number;
  displayOrder: number;
  navigationLabel: string | null;
};

type Summary = {
  id: string;
  summaryCode: string | null;
  canonicalSlug: string | null;
  packageId: string;
  slug: string;
  title: string;
  content: string;
  document: string | null;
  isPublished: boolean;
  currentPublishedVersionId: string | null;
  archived: boolean;
  revisions: Revision[];
  memberships: Membership[];
};

type EditInput = {
  summaryId: string;
  packageId: string;
  packageIds: string[] | null;
  legacySlug: string;
  title: string;
  content: string;
  document: string | null;
};

type Failure = 'during-membership' | 'during-visibility' | 'after-membership' | 'after-content';

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
  assert.equal(summary.canonicalSlug, null);
  assert.equal(summary.revisions.length, 0);
  assert.equal(summary.memberships.length, 0);
}

function assertKpInvariant(summary: Summary): void {
  assert.notEqual(summary.summaryCode, null);
  assert.notEqual(summary.canonicalSlug, null);
  assert.ok(summary.memberships.length >= 1);
  assert.equal(new Set(summary.memberships.map((membership) => membership.packageId)).size, summary.memberships.length);
  assert.equal(summary.memberships.filter((membership) => membership.marker).length, 1);
  const marker = summary.memberships.find((membership) => membership.marker)!;
  assert.equal(marker.packageId, summary.packageId);
  assert.equal(marker.legacySlug, summary.slug);
}

function assertVisibilityInvariant(summary: Summary): void {
  const expectedStatus = summary.isPublished
    ? 'active'
    : summary.currentPublishedVersionId !== null
      ? 'hidden'
      : 'draft';
  assert.ok(
    summary.memberships.every((membership) => membership.status === expectedStatus),
    `expected every membership to be ${expectedStatus}`,
  );
}

function makeMembership(
  packageId: string,
  marker: boolean,
  legacySlug: string | null,
  status: Membership['status'],
): Membership {
  return {
    packageId,
    legacySlug,
    marker,
    status,
    sortOrder: 0,
    displayOrder: 0,
    navigationLabel: null,
  };
}

function makeLegacy(id: string, packageId: string, slug: string): Summary {
  return {
    id,
    summaryCode: null,
    canonicalSlug: null,
    packageId,
    slug,
    title: 'Legacy title',
    content: 'Legacy content',
    document: 'Legacy document',
    isPublished: false,
    currentPublishedVersionId: null,
    archived: false,
    revisions: [],
    memberships: [],
  };
}

function makeKp(
  id: string,
  packageIds: string[],
  slug = 'kp-summary',
  options: {
    published?: boolean;
    unpublishedAfterPublication?: boolean;
    canonicalPackageId?: string;
    archived?: boolean;
  } = {},
): Summary {
  const canonicalPackageId = options.canonicalPackageId ?? [...packageIds].sort()[0]!;
  const published = options.published ?? false;
  const hasPublishedHistory = published || (options.unpublishedAfterPublication ?? false);
  const publishedVersionId = hasPublishedHistory ? `${id}-v1` : null;
  const membershipStatus: Membership['status'] = published
    ? 'active'
    : hasPublishedHistory
      ? 'hidden'
      : 'draft';
  return {
    id,
    summaryCode: 'SUM-072',
    canonicalSlug: 'kp-canonical',
    packageId: canonicalPackageId,
    slug,
    title: 'KP title',
    content: 'KP content',
    document: 'KP document',
    isPublished: published,
    currentPublishedVersionId: hasPublishedHistory ? publishedVersionId : null,
    archived: options.archived ?? false,
    revisions: [{
      id: publishedVersionId ?? `${id}-draft`,
      content: 'KP content',
      status: hasPublishedHistory ? 'published' : 'draft',
      sourceSnapshots: false,
    }],
    memberships: packageIds.map((packageId) => makeMembership(
      packageId,
      packageId === canonicalPackageId,
      packageId === canonicalPackageId ? slug : null,
      membershipStatus,
    )),
  };
}

class HybridEditModel {
  public state = new Map<string, Summary>();
  private readonly packages = new Set<string>();
  public reconcileCalls = 0;

  private transaction<T>(operation: () => T): T {
    const before = cloneState(this.state);
    const beforeReconcileCalls = this.reconcileCalls;
    try {
      return operation();
    } catch (error) {
      this.state = before;
      this.reconcileCalls = beforeReconcileCalls;
      throw error;
    }
  }

  public registerPackage(packageId: string): void {
    this.packages.add(packageId);
  }

  public seed(summary: Summary): void {
    if (summary.summaryCode === null) assertLegacyInvariant(summary);
    else {
      assertKpInvariant(summary);
      assertVisibilityInvariant(summary);
    }
    this.state.set(summary.id, cloneSummary(summary));
    this.packages.add(summary.packageId);
    for (const membership of summary.memberships) this.packages.add(membership.packageId);
  }

  private assertPackageSet(packageIds: string[]): void {
    if (packageIds.length === 0) throw new Error('at least one Package ID is required');
    if (new Set(packageIds).size !== packageIds.length) throw new Error('duplicate Package ID');
    if (packageIds.some((packageId) => !this.packages.has(packageId))) throw new Error('Package does not exist');
  }

  private assertCollisions(summaryId: string, packageIds: string[], slug: string): void {
    for (const summary of this.state.values()) {
      if (summary.id === summaryId) continue;
      if (summary.packageId && summary.packageId && summary.slug === slug && summary.packageId && packageIds.includes(summary.packageId)) {
        throw new Error('Package/slug collision');
      }
      if (summary.memberships.some((membership) => packageIds.includes(membership.packageId) && membership.legacySlug === slug)) {
        throw new Error('Package/slug collision through membership');
      }
    }
  }

  private reconcile(summary: Summary, packageIds: string[], slug: string, failure: Failure | undefined): void {
    this.reconcileCalls += 1;
    const currentCanonical = summary.packageId;
    const canonicalPackageId = packageIds.includes(currentCanonical)
      ? currentCanonical
      : [...packageIds].sort()[0]!;
    const oldByPackage = new Map(summary.memberships.map((membership) => [membership.packageId, membership]));
    const canonicalExisting = oldByPackage.get(canonicalPackageId);
    const canonicalSlug = canonicalExisting?.legacySlug ?? summary.slug;

    summary.memberships = packageIds.map((packageId) => (
      oldByPackage.get(packageId) ?? makeMembership(packageId, false, null, 'draft')
    ));
    if (failure === 'during-membership') throw new Error('membership reconciliation failed');

    for (const membership of summary.memberships) membership.marker = false;
    const marker = summary.memberships.find((membership) => membership.packageId === canonicalPackageId)!;
    marker.marker = true;
    marker.legacySlug = slug || canonicalSlug;
    summary.packageId = canonicalPackageId;
    summary.slug = slug || canonicalSlug;
    assertKpInvariant(summary);
  }

  private normalizeMembershipVisibility(summary: Summary, failure: Failure | undefined): void {
    const expectedStatus: Membership['status'] = summary.isPublished
      ? 'active'
      : summary.currentPublishedVersionId !== null
        ? 'hidden'
        : 'draft';
    for (const [index, membership] of summary.memberships.entries()) {
      membership.status = expectedStatus;
      if (failure === 'during-visibility' && index === 0) {
        throw new Error('membership visibility normalization failed');
      }
    }
    assertVisibilityInvariant(summary);
  }

  public edit(input: EditInput, failure?: Failure): Summary {
    return this.transaction(() => {
      const summary = this.state.get(input.summaryId);
      if (!summary) throw new Error('Summary does not exist');
      if (!input.title.trim() || !input.content.trim()) throw new Error('content is required');
      if (summary.archived) throw new Error('Archived Summary cannot be edited');

      if (summary.summaryCode === null) {
        if (input.packageIds !== null && (input.packageIds.length !== 1 || input.packageIds[0] !== input.packageId)) {
          throw new Error('Legacy edit requires one Package');
        }
        if (summary.packageId !== input.packageId) throw new Error('Legacy Package reassignment is not permitted');
        if (summary.revisions.length !== 0 || summary.memberships.length !== 0) throw new Error('Legacy KP state is invalid');
        this.assertCollisions(summary.id, [input.packageId], input.legacySlug);
        summary.title = input.title;
        summary.content = input.content;
        summary.document = input.document;
        summary.slug = input.legacySlug;
        if (failure === 'after-content') throw new Error('injected Legacy edit failure');
        assertLegacyInvariant(summary);
        return summary;
      }

      if (input.packageIds === null) throw new Error('KP-native edit requires a complete Package set');
      this.assertPackageSet(input.packageIds);
      if (!input.packageIds.includes(input.packageId)) throw new Error('edit Package is not selected');
      this.assertCollisions(summary.id, input.packageIds, input.legacySlug);
      assertKpInvariant(summary);

      const draft = summary.revisions.find((revision) => revision.status === 'draft');
      if (summary.revisions.some((revision) => revision.status === 'in_review')) throw new Error('in-review revision is not editable');
      const version = draft ?? (
        summary.currentPublishedVersionId
          ? { id: `${summary.id}-v${summary.revisions.length + 1}`, content: summary.content, status: 'draft' as const, sourceSnapshots: false }
          : null
      );
      if (!version) throw new Error('KP edit requires a draft or published history');
      if (version.sourceSnapshots) throw new Error('explicit source snapshots are protected');
      if (!draft) summary.revisions.push(version);

      this.reconcile(summary, input.packageIds, input.legacySlug, failure);
      this.normalizeMembershipVisibility(summary, failure);
      if (failure === 'after-membership') throw new Error('injected failure after membership reconciliation');

      version.content = input.content;
      summary.title = input.title;
      summary.content = input.content;
      summary.document = input.document;
      const selected = summary.memberships.find((membership) => membership.packageId === input.packageId)!;
      selected.sortOrder += 1;
      if (failure === 'after-content') throw new Error('injected failure after content mutation');

      assertKpInvariant(summary);
      assertVisibilityInvariant(summary);
      return summary;
    });
  }
}

function baseEdit(summaryId: string, packageId: string, packageIds: string[] | null, legacySlug: string): EditInput {
  return {
    summaryId,
    packageId,
    packageIds,
    legacySlug,
    title: 'Edited title',
    content: 'Edited content',
    document: 'Edited document',
  };
}

function register(model: HybridEditModel, packageIds: string[]): void {
  for (const packageId of packageIds) model.registerPackage(packageId);
}

function verifiesSelectedPackageMembershipPredicate(): void {
  const edit = extractFunction(/create\s+function\s+public\.kp_persist_update_compatibility_summary\s*\(/i);
  assert.match(
    edit,
    /if\s+not\s*\(\s*p_package_id\s*=\s*any\s*\(\s*p_package_ids\s*\)\s*\)\s*then/i,
    '072 must reject only when the selected Package is absent from the complete set',
  );
  assert.doesNotMatch(edit, /p_package_id\s*<>\s*any\s*\(\s*p_package_ids\s*\)/i);
  assert.match(edit, /p_package_ids\s+is\s+null\s+or\s+cardinality\(p_package_ids\)\s+is\s+null/i);
  assert.match(edit, /requested\.package_id\s+is\s+null/i);

  const accepted = new HybridEditModel();
  register(accepted, ['package-b', 'package-c', 'package-d']);
  accepted.seed(makeKp('kp-membership-accepted', ['package-b'], 'membership-accepted'));
  const edited = accepted.edit(
    baseEdit('kp-membership-accepted', 'package-b', ['package-b', 'package-c', 'package-d'], 'membership-accepted'),
  );
  assert.equal(edited.memberships.length, 3, 'selected B must be accepted in [B,C,D]');
  assert.ok(edited.memberships.some((membership) => membership.packageId === 'package-b'));

  const missing = new HybridEditModel();
  register(missing, ['package-b', 'package-c', 'package-d', 'package-x']);
  missing.seed(makeKp('kp-membership-missing', ['package-b'], 'membership-missing'));
  const beforeMissing = fingerprint(missing.state);
  assert.throws(
    () => missing.edit(
      baseEdit('kp-membership-missing', 'package-x', ['package-b', 'package-c', 'package-d'], 'membership-missing'),
    ),
    /edit Package is not selected/i,
  );
  assert.equal(fingerprint(missing.state), beforeMissing, 'missing selected Package must fail atomically');

  const single = new HybridEditModel();
  register(single, ['package-b']);
  single.seed(makeKp('kp-membership-single', ['package-b'], 'membership-single'));
  const singleEdited = single.edit(
    baseEdit('kp-membership-single', 'package-b', ['package-b'], 'membership-single'),
  );
  assert.equal(singleEdited.memberships.length, 1, 'single Package [B] must remain valid');

  assert.match(
    writerCoreSql,
    /if\s+v_membership_count\s+<=\s+1\s+then\s+raise\s+exception\s+using\s+errcode\s*=\s*'cardinality_violation',\s+message\s*=\s*'A KP-native Summary must retain at least one Package membership\.'/i,
    '068 final-membership protection must remain unchanged',
  );
}

function verifiesLegacyEditIsolation(): void {
  const model = new HybridEditModel();
  register(model, ['legacy-package']);
  model.seed(makeLegacy('legacy-edit', 'legacy-package', 'legacy-slug'));
  const edited = model.edit(baseEdit('legacy-edit', 'legacy-package', null, 'legacy-edited-slug'));
  assert.equal(edited.summaryCode, null);
  assert.equal(edited.packageId, 'legacy-package');
  assert.equal(edited.slug, 'legacy-edited-slug');
  assert.equal(edited.memberships.length, 0);
  assert.equal(edited.revisions.length, 0);
  assert.equal(model.reconcileCalls, 0, 'Legacy edit must not enter KP reconciliation');
}

function verifiesKpOnePackageEdit(): void {
  const model = new HybridEditModel();
  register(model, ['package-a']);
  model.seed(makeKp('kp-one', ['package-a'], 'one-slug'));
  const edited = model.edit(baseEdit('kp-one', 'package-a', ['package-a'], 'one-slug'));
  assert.equal(edited.summaryCode, 'SUM-072');
  assert.equal(edited.memberships.length, 1);
  assert.equal(edited.revisions.length, 1);
  assert.equal(edited.content, 'Edited content');
  assertKpInvariant(edited);
  assertVisibilityInvariant(edited);
}

function verifiesKpThreePackageAddAndPreserveCanonical(): void {
  const model = new HybridEditModel();
  register(model, ['package-a', 'package-b', 'package-c']);
  model.seed(makeKp('kp-three', ['package-a'], 'three-slug'));
  const edited = model.edit(baseEdit('kp-three', 'package-a', ['package-a', 'package-b', 'package-c'], 'three-slug'));
  assert.equal(edited.memberships.length, 3);
  assert.equal(edited.packageId, 'package-a');
  assert.equal(edited.memberships.find((membership) => membership.marker)!.packageId, 'package-a');
  assert.equal(edited.memberships.filter((membership) => membership.marker).length, 1);
  assert.equal(edited.revisions.length, 1);
  assert.ok(edited.memberships.every((membership) => membership.status === 'draft'));
  assertVisibilityInvariant(edited);
}

function verifiesKpSecondaryRemovalPreservesCanonical(): void {
  const model = new HybridEditModel();
  register(model, ['package-a', 'package-b', 'package-c']);
  model.seed(makeKp('kp-remove', ['package-a', 'package-b', 'package-c'], 'remove-slug'));
  const edited = model.edit(baseEdit('kp-remove', 'package-b', ['package-a', 'package-b'], 'remove-slug'));
  assert.equal(edited.memberships.length, 2);
  assert.equal(edited.memberships.some((membership) => membership.packageId === 'package-c'), false);
  assert.equal(edited.packageId, 'package-a');
  assert.equal(edited.memberships.find((membership) => membership.marker)!.packageId, 'package-a');
  assertKpInvariant(edited);
  assertVisibilityInvariant(edited);
}

function verifiesCanonicalRemovalRotatesDeterministically(): void {
  const model = new HybridEditModel();
  register(model, ['package-a', 'package-b', 'package-c']);
  model.seed(makeKp('kp-rotate', ['package-b', 'package-c'], 'rotate-slug', { canonicalPackageId: 'package-c' }));
  const edited = model.edit(baseEdit('kp-rotate', 'package-b', ['package-a', 'package-b'], 'rotated-slug'));
  assert.equal(edited.packageId, 'package-a');
  assert.equal(edited.slug, 'rotated-slug');
  assert.equal(edited.memberships.find((membership) => membership.marker)!.packageId, 'package-a');
  assert.equal(edited.memberships.find((membership) => membership.marker)!.legacySlug, 'rotated-slug');
  assert.equal(edited.memberships.filter((membership) => membership.marker).length, 1);
  assertKpInvariant(edited);
  assertVisibilityInvariant(edited);
}

function verifiesFinalPackageRemovalAndInvalidSets(): void {
  const model = new HybridEditModel();
  register(model, ['package-a', 'package-b']);
  model.seed(makeKp('kp-invalid', ['package-a'], 'invalid-slug'));
  const before = fingerprint(model.state);

  const invalidSets: Array<[string[], RegExp]> = [
    [[], /at least one Package/i],
    [['package-a', 'package-a'], /duplicate Package/i],
    [['package-a', 'package-missing'], /Package does not exist/i],
  ];
  for (const [packageIds, error] of invalidSets) {
    assert.throws(
      () => model.edit(baseEdit('kp-invalid', 'package-a', packageIds, 'invalid-slug')),
      error,
    );
    assert.equal(fingerprint(model.state), before);
  }

  assert.throws(
    () => model.edit(baseEdit('kp-invalid', 'package-a', [], 'invalid-slug')),
    /at least one Package/i,
  );
  assert.equal(fingerprint(model.state), before);
}

function verifiesSecondaryCollisionFailsClosed(): void {
  const model = new HybridEditModel();
  register(model, ['package-a', 'package-b', 'package-c']);
  model.seed(makeKp('kp-target', ['package-a'], 'target-slug'));
  const other = makeKp('kp-other', ['package-b', 'package-c'], 'other-slug');
  other.memberships.find((membership) => membership.packageId === 'package-c')!.legacySlug = 'target-slug';
  model.seed(other);
  const before = fingerprint(model.state);

  assert.throws(
    () => model.edit(baseEdit('kp-target', 'package-a', ['package-a', 'package-c'], 'target-slug')),
    /collision through membership/i,
  );
  assert.equal(fingerprint(model.state), before);
}

function verifiesPublishedHistoryAndSharedRootSafety(): void {
  const model = new HybridEditModel();
  register(model, ['package-a', 'package-b']);
  model.seed(makeKp('kp-published', ['package-a'], 'published-slug', { published: true }));
  const beforePublishedPointer = model.state.get('kp-published')!.currentPublishedVersionId;
  const edited = model.edit(baseEdit('kp-published', 'package-a', ['package-a', 'package-b'], 'published-slug'));
  assert.equal(edited.id, 'kp-published');
  assert.equal(edited.currentPublishedVersionId, beforePublishedPointer);
  assert.equal(edited.revisions.length, 2);
  assert.equal(edited.revisions.filter((revision) => revision.status === 'published').length, 1);
  assert.equal(edited.revisions.filter((revision) => revision.status === 'draft').length, 1);
  assert.equal(model.state.size, 1, 'KP edit must not duplicate the Summary root');
  assertKpInvariant(edited);
  assert.ok(edited.memberships.every((membership) => membership.status === 'active'));
  assertVisibilityInvariant(edited);
}

function verifiesPublishedCanonicalRotationKeepsAllMembershipsActive(): void {
  const model = new HybridEditModel();
  register(model, ['package-a', 'package-b', 'package-c']);
  model.seed(makeKp('kp-published-rotate', ['package-b', 'package-c'], 'published-rotate', {
    published: true,
    canonicalPackageId: 'package-c',
  }));
  const edited = model.edit(baseEdit('kp-published-rotate', 'package-b', ['package-a', 'package-b'], 'published-rotated'));
  assert.equal(edited.packageId, 'package-a');
  assert.equal(edited.memberships.filter((membership) => membership.marker).length, 1);
  assert.ok(edited.memberships.every((membership) => membership.status === 'active'));
  assertVisibilityInvariant(edited);
}

function verifiesUnpublishedAfterPublicationNormalizesHidden(): void {
  const model = new HybridEditModel();
  register(model, ['package-a', 'package-b']);
  model.seed(makeKp('kp-unpublished', ['package-a'], 'unpublished-slug', { unpublishedAfterPublication: true }));
  const edited = model.edit(baseEdit('kp-unpublished', 'package-a', ['package-a', 'package-b'], 'unpublished-slug'));
  assert.equal(edited.isPublished, false);
  assert.notEqual(edited.currentPublishedVersionId, null);
  assert.ok(edited.memberships.every((membership) => membership.status === 'hidden'));
  assertVisibilityInvariant(edited);
}

function verifiesVisibilityNormalizationRollbackAndArchivedRejection(): void {
  const model = new HybridEditModel();
  register(model, ['package-a', 'package-b', 'package-c']);
  model.seed(makeKp('kp-visibility-atomic', ['package-b', 'package-c'], 'visibility-atomic', {
    published: true,
    canonicalPackageId: 'package-c',
  }));
  const before = fingerprint(model.state);

  assert.throws(
    () => model.edit(baseEdit('kp-visibility-atomic', 'package-b', ['package-a', 'package-b'], 'visibility-rotated'), 'during-visibility'),
    /visibility normalization failed/i,
  );
  assert.equal(fingerprint(model.state), before, 'visibility failure must roll back content, memberships, and canonical rotation');

  const archived = new HybridEditModel();
  register(archived, ['package-a']);
  archived.seed(makeKp('kp-archived', ['package-a'], 'archived-slug', { archived: true }));
  const archivedBefore = fingerprint(archived.state);
  assert.throws(
    () => archived.edit(baseEdit('kp-archived', 'package-a', ['package-a'], 'archived-slug')),
    /Archived Summary cannot be edited/i,
  );
  assert.equal(fingerprint(archived.state), archivedBefore);
}

function verifiesAtomicRollbackForBothMutationDirections(): void {
  const model = new HybridEditModel();
  register(model, ['package-a', 'package-b', 'package-c']);
  model.seed(makeKp('kp-atomic', ['package-a', 'package-b'], 'atomic-slug'));
  const before = fingerprint(model.state);

  assert.throws(
    () => model.edit(baseEdit('kp-atomic', 'package-b', ['package-a', 'package-b', 'package-c'], 'atomic-slug'), 'after-membership'),
    /after membership/i,
  );
  assert.equal(fingerprint(model.state), before, 'content failure must roll back membership changes');

  assert.throws(
    () => model.edit(baseEdit('kp-atomic', 'package-b', ['package-a', 'package-b', 'package-c'], 'atomic-slug'), 'during-membership'),
    /membership reconciliation failed/i,
  );
  assert.equal(fingerprint(model.state), before, 'membership failure must roll back revision/content changes');

  assert.throws(
    () => model.edit(baseEdit('kp-atomic', 'package-b', ['package-a', 'package-b', 'package-c'], 'atomic-slug'), 'after-content'),
    /after content/i,
  );
  assert.equal(fingerprint(model.state), before, 'content/revision failure must roll back the complete edit');
}

const tests = [
  ['static Hybrid edit, discriminator, and security contract', verifiesStaticHybridEditContract],
  ['selected Package membership predicate and final-membership protection', verifiesSelectedPackageMembershipPredicate],
  ['Legacy edit remains single-Package with zero KP state', verifiesLegacyEditIsolation],
  ['KP one-Package edit updates one shared aggregate', verifiesKpOnePackageEdit],
  ['KP three-Package edit adds memberships and preserves canonical', verifiesKpThreePackageAddAndPreserveCanonical],
  ['KP secondary removal preserves canonical membership', verifiesKpSecondaryRemovalPreservesCanonical],
  ['KP canonical removal rotates to the deterministic retained Package', verifiesCanonicalRemovalRotatesDeterministically],
  ['empty, duplicate, invalid, and final-removal sets fail closed', verifiesFinalPackageRemovalAndInvalidSets],
  ['secondary Package/slug collision fails closed', verifiesSecondaryCollisionFailsClosed],
  ['published history and one shared root remain safe', verifiesPublishedHistoryAndSharedRootSafety],
  ['published canonical rotation keeps every membership active', verifiesPublishedCanonicalRotationKeepsAllMembershipsActive],
  ['unpublished-after-publication memberships become hidden', verifiesUnpublishedAfterPublicationNormalizesHidden],
  ['visibility normalization and archived edits fail atomically', verifiesVisibilityNormalizationRollbackAndArchivedRejection],
  ['membership/content/revision failures roll back atomically', verifiesAtomicRollbackForBothMutationDirections],
] as const;

for (const [name, run] of tests) {
  run();
  process.stdout.write(`✓ ${name}\n`);
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 072 tests passed.\n`);
