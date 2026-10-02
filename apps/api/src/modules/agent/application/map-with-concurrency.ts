/**
 * Como `Promise.all(items.map(task))`, mas com no máximo `limit` tarefas em
 * andamento ao mesmo tempo. Os resultados saem na ordem dos itens.
 */
export async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  task: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;

  /** Cada trabalhador pega o próximo item livre até a lista acabar. */
  async function work(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index] as Item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work));
  return results;
}
