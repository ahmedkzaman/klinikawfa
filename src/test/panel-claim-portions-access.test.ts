import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('panel claim portion purchaser access', () => {
  it('admits purchasers only through the billing routes required by the workflow', () => {
    const app = readSource('src/App.tsx');
    const route = readSource('src/components/ClinicProtectedRoute.tsx');

    expect(route).toContain("| 'billing_or_purchaser'");
    expect(route).toMatch(/requiredRole === 'billing_or_purchaser'[\s\S]*role === 'purchaser'/);
    expect(app).toMatch(/path="dispensary"[\s\S]*requiredRole="billing_or_purchaser"/);
    expect(app).toMatch(/path="queue\/checkout\/:queueEntryId"[\s\S]*requiredRole="billing_or_purchaser"/);
    expect(app).toMatch(/path="panel-claims"[\s\S]*requiredRole="billing_or_purchaser"/);
  });
});
