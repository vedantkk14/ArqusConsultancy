/** Shape of every list endpoint: ?page=1&page_size=20. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
