/**
 * Composition-root exports for the concrete Knowledge Platform persistence
 * adapter.  Application services and contracts remain storage-agnostic under
 * `lib/application/knowledge-platform`.
 */

export {
  SupabaseKnowledgePlatformUnitOfWork,
  createSupabaseKnowledgePlatformUnitOfWork,
  assertTransactionalExecutor,
} from './supabase-unit-of-work'

export {
  SupabasePackageRepository,
  SupabasePackageSummaryRepository,
  SupabaseSummaryRepository,
  SupabaseSummaryLibraryReadRepository,
  SupabaseSummarySourceRepository,
  SupabaseSummaryVersionRepository,
  createSupabaseKnowledgePlatformRepositories,
  createSupabaseSummaryLibraryReadRepository,
} from './supabase-repositories'

export {
  PersistenceAdapterError,
  UnsupportedSupabaseTransactionExecutor,
  adaptSupabaseClient,
} from './persistence'

export type {
  KnowledgePlatformRepositorySet,
} from './supabase-repositories'

export type {
  SupabasePersistenceClient,
  SupabasePersistenceErrorShape,
  SupabasePersistenceQuery,
  SupabasePersistenceResult,
  SupabaseTransactionExecutor,
  PersistenceTransactionOperation,
} from './persistence'
