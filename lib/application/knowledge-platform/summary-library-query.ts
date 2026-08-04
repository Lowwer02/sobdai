import type {
  SummaryLibraryItem,
  SummaryLibraryQuery,
  SummaryLibraryReadRepository,
} from './contracts'

/**
 * Application read use case for the Admin Summary Library.
 *
 * Filtering, pagination, and presentation shaping are intentionally not
 * introduced here ahead of their approved product-layer slices. This first
 * query returns the target projection's complete Markdown-free library DTO.
 */
export class SummaryLibraryQueryService implements SummaryLibraryQuery {
  public constructor(
    private readonly repository: SummaryLibraryReadRepository
  ) {}

  public async list(): Promise<readonly SummaryLibraryItem[]> {
    return this.repository.list()
  }
}
