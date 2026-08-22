# SEC Profile RBAC disposable database harness

**sec-profile-rbac-db-test.mjs** is an opt-in, destructive security harness
for the SEC Profile RBAC Baseline Hardening migration (079). It is not part of
the normal application, build, test, or CI paths. Before the adversarial suite,
it invokes **sec-profile-rbac-db-bootstrap.mjs** to reconstruct the verified
Production-like pre-079 profile baseline, prove the pre-079 self-promotion
vulnerability, apply the working-tree 079 migration, and run the compatibility
cases for clean legacy, normalized, unsafe, and incompatible status shapes.

## Preconditions

Use only a disposable Supabase-compatible project that has:

- Supabase Auth primitives (auth.uid(), auth.users, anon,
  authenticated, and service_role);
- the effective pre-079 profile/public-content fixture used by SEC-DB2A/2B;
- the `promotions` table with the named live-promotion fixture; and
- the effective residual privileged surface: organizations, positions,
  packages, exam_sets, questions, exam_set_questions, orders, the
  package-assets/news-assets/article-assets storage buckets, and the three KP
  reference-document tables; and
- the eight known disposable fixture profiles whose email identifiers are
  sec-db2a-owner-a@example.com, sec-db2a-owner-b@example.com,
  sec-db2a-admin@example.com, sec-db2a-editor@example.com,
  sec-db2a-support@example.com, sec-db2a-normal-user@example.com,
  sec-db2a-banned-user@example.com, and
  sec-db2a-deleted-user@example.com.

The bootstrap helper does not replay historical migrations, create Auth users,
or provision credentials. It only operates after confirming that the target
contains exactly the eight named disposable fixture profiles and their Auth
users. It reconstructs the relevant pre-079 policies and profile columns,
temporarily removes the normalized `status` column, applies the working-tree
079 SQL, and leaves the test project on a clean post-079 fixture. It refuses
ambiguous fixture populations.

The compatibility cases prove:

- missing `status` plus clean legacy metadata succeeds and normalizes all rows
  to `active`;
- an existing correct `status` shape succeeds;
- missing `status` plus non-null legacy ban/deletion metadata aborts without
  adding the column; and
- an incompatible existing `status` definition aborts without repairing it.

## Owner product invariant

Sobdai may have multiple usable Owners; two or more are valid and desirable.
SEC-079 imposes no maximum Owner count and does not impose an exactly-one-Owner
constraint. A usable Owner is a profile with role = owner, status = active,
and deleted_at IS NULL.

The only protected invariant is:

    usable_owner_count >= 1

The harness explicitly promotes a normal fixture user to an additional Owner,
verifies that the count can increase to three, then demotes that fixture user
back to a normal user. The reset baseline of two usable Owners is test-fixture
setup only and is not a product constraint.

## Required environment

The harness reads only these explicitly named test variables:

- SEC_DB_ALLOW_DESTRUCTIVE_TESTS — must equal
  YES_I_AM_USING_SOBDAI_SEC_TEST;
- SEC_DB_TEST_PROJECT_REF — 20 lowercase alphanumeric characters;
- SEC_DB_TEST_SUPABASE_URL — https://<project-ref>.supabase.co; and
- SEC_DB_TEST_DATABASE_URL — a PostgreSQL connection string for the same
  disposable project.

It never loads .env, .env.local, or any application environment file. It
does not read or require an anon key, service-role key, JWT, or separate
password variable. The password, when needed, is accepted only as part of the
explicit disposable database URL and is never printed. Keep all connection
secrets outside Git.

The harness binds the PostgreSQL target to the declared project ref. A direct
connection must use `db.<project-ref>.supabase.co` as `postgres`; a Supabase
pooler connection must use a Supabase pooler hostname and the exact
`postgres.<project-ref>` username. Both forms must target the `postgres`
database. Mismatched, non-Supabase, or ambiguous targets fail before fixture
setup.

For an isolated invocation, load only the disposable test file and clear the
ambient application environment:

~~~sh
env -i PATH="$PATH" node --env-file=/absolute/path/to/disposable/.env \
  scripts/security/sec-profile-rbac-db-test.mjs
~~~

The command fails closed if a normal application endpoint variable is present,
the guard is absent or incorrect, the project URL does not match the supplied
test ref, the PostgreSQL target does not match the same project, or the
PostgreSQL endpoint is malformed. The PostgreSQL URL is never printed.

## Coverage

The harness performs a status-bootstrap compatibility suite and then catalog/
prerequisite checks, including an explicit
category-A mutation inventory and a catalog-wide residual-policy assertion;
post-079 direct profile mutation checks; low-privilege RPC checks;
active/banned/deleted RLS probes for Package/exam/question, Orders, all three
asset buckets, and KP reference-document mutation; active/inactive manager
content-write checks; anonymous profile/public-content/promotion boundary
checks; self-deactivation checks; and the four owner races plus the manager
authorization TOCTOU race. Race checks use separate pg clients, real
transactions, advisory-lock contention, pg_stat_activity blocking evidence,
and bounded waits. The usable Owner invariant is checked after each
transaction commit and at the final state, while the multiple-Owner
assignment path verifies that no maximum/exactly-one rule is assumed.

The pg package is a development-only dependency. No production runtime
dependency is added.
