import DocumentTemplateBuilder from '@/components/clinic/settings/DocumentTemplateBuilder';
import { pageInner, pageShell } from '@/lib/clinic/bentoTokens';

export default function DocumentTemplates() {
  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Document Templates
          </h1>
          <p className="text-sm text-slate-500">
            Build reusable document templates with live variable substitution. Insert tags
            like <code className="font-mono">{'{{patient_name}}'}</code> and watch them
            render on a digital A4 / A5 sheet.
          </p>
        </div>
        <DocumentTemplateBuilder />
      </div>
    </div>
  );
}
