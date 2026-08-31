import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { budgetCategoryList, type BudgetCategory } from '@/lib/clinic/procurementDashboard';

/**
 * Upsert exactly one budget row per category on (budget_month, category).
 * Rejects negative or non-finite amounts before touching the database.
 */
export function useSaveProcurementBudgets(month: string) {
  const queryClient = useQueryClient();

  const saveBudgets = useMutation({
    mutationFn: async ({ budgets }: { budgets: Record<BudgetCategory, number> }) => {
      const rows = budgetCategoryList().map((category) => {
        const amount = budgets[category];
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error(`Invalid budget amount for ${category}`);
        }
        return {
          budget_month: month,
          category,
          amount,
        };
      });

      const { error } = await supabase
        .from('procurement_monthly_budgets')
        .upsert(rows, { onConflict: 'budget_month,category' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', 'dashboard', month] });
    },
  });

  return { saveBudgets };
}
