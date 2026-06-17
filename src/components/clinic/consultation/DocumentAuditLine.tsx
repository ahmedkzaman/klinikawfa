import { useMemo } from 'react';
import { useClinicUsers } from '@/hooks/clinic/useClinicUsers';
import type { ConsultationDocument } from '@/hooks/clinic/useClinicDocuments';

interface Props {
  doc: ConsultationDocument;
}

/**
 * Audit trail line for an issued clinical document.
 * Shows: issuer name, exact timestamp, and the visit/consultation it belongs to.
 */
export function DocumentAuditLine({ doc }: Props) {
  const { data: users = [] } = useClinicUsers();

  const issuerName = useMemo(() => {
    if (!doc.created_by) return 'System';
    const u = users.find((x) => x.id === doc.created_by);
    return u?.full_name || u?.email || 'Unknown user';
  }, [users, doc.created_by]);

  const issuedAt = new Date(doc.created_at).toLocaleString('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const visitRef = doc.consultation_id ? doc.consultation_id.slice(0, 8) : '—';

  return (
    <div className="text-[11px] text-muted-foreground leading-snug">
      <span className="capitalize">{doc.type ?? 'document'}</span>
      {' · '}
      {doc.paper_size} {doc.orientation}
      <span className="mx-1">·</span>
      <span title={`Visit ID: ${doc.consultation_id ?? ''}`}>
        Visit #{visitRef}
      </span>
      <br />
      <span>
        Issued by <span className="font-medium text-slate-700">{issuerName}</span>
        {' · '}
        <time dateTime={doc.created_at}>{issuedAt}</time>
      </span>
    </div>
  );
}
