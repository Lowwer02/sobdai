import {
  SummaryLibraryQueryService,
  type SummaryLibraryItem,
} from '@/lib/application/knowledge-platform'
import { requirePermission } from '@/lib/auth/server-protect'
import { createSupabaseSummaryLibraryReadRepository } from '@/lib/infrastructure/knowledge-platform'

/**
 * Authenticated server query for the Admin Summary Library.
 *
 * Authorization stays at the server boundary while the query composition and
 * DTO mapping remain in the Application and Persistence Layers respectively.
 */
export async function getSummaryLibrary(): Promise<readonly SummaryLibraryItem[]> {
  const { supabase } = await requirePermission('content.read')
  const repository = createSupabaseSummaryLibraryReadRepository(supabase)
  return new SummaryLibraryQueryService(repository).list()
}
