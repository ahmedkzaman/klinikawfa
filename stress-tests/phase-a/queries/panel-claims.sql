-- usePanelClaims over 30-day window
SELECT pc.id, pc.claim_no, pc.amount, pc.status, pc.claim_date,
       pp.name AS panel_name, p.name AS patient_name
FROM public.panel_claims pc
JOIN public.panel_providers pp ON pp.id = pc.panel_id
JOIN public.patients p ON p.id = pc.patient_id
WHERE pc.claim_date >= current_date - interval '30 days'
ORDER BY pc.claim_date DESC, pc.created_at DESC
LIMIT 500;
