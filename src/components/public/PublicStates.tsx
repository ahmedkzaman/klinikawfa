export function PublicLoadingState({ label }: { label: string }) {
  return (
    <div className="container py-14 md:py-20" role="status">
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}

export interface PublicEmptyStateProps {
  title: string;
  description: string;
}

export function PublicEmptyState({ title, description }: PublicEmptyStateProps) {
  return (
    <div className="container py-14 md:py-20">
      <div className="max-w-2xl rounded-lg border border-border bg-card p-6 md:p-8">
        <h2 className="font-display text-2xl font-semibold text-card-foreground">
          {title}
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
