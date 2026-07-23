export interface PublicPageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
}

export function PublicPageHeader({
  title,
  description,
  eyebrow,
}: PublicPageHeaderProps) {
  return (
    <header className="border-b border-border/70 bg-background">
      <div className="container py-14 md:py-20">
        <div className="max-w-3xl">
          <span className="public-clinic-line mb-5" aria-hidden="true" />
          {eyebrow && (
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-4xl font-semibold leading-tight text-foreground md:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
