export async function readPages<T>(read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await read(start, start + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

/** Keep UUID filters below practical proxy URL limits. Pages must have a stable order. */
export async function readIdChunks<T>(ids: readonly string[], read: (chunk: string[]) => PromiseLike<T[]>): Promise<T[]> {
  const rows: T[] = [];
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 100) {
    rows.push(...await read(unique.slice(start, start + 100)));
  }
  return rows;
}
