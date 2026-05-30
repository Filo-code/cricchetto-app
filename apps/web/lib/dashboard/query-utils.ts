export async function mergeByKey<K, T>(
  queries: Array<() => Promise<T[]>>,
  keyFn: (item: T) => K,
): Promise<Map<K, T>> {
  const results = await Promise.all(queries.map((q) => q()));
  const map = new Map<K, T>();
  for (const rows of results) {
    for (const row of rows) map.set(keyFn(row), row);
  }
  return map;
}
