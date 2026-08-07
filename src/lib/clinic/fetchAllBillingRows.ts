const BILLING_PAGE_SIZE = 1_000;

export async function fetchAllBillingRows<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
): Promise<T[]> {
  const allRows: T[] = [];

  for (let from = 0; ; from += BILLING_PAGE_SIZE) {
    const page = await fetchPage(from, from + BILLING_PAGE_SIZE - 1);
    allRows.push(...page);
    if (page.length < BILLING_PAGE_SIZE) return allRows;
  }
}
