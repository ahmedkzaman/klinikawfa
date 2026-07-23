import { cn } from "@/lib/utils";

export interface PublicSectionHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  align?: "left" | "center";
}

export function PublicSectionHeader({
  title,
  description,
  eyebrow,
  align = "left",
}: PublicSectionHeaderProps) {
  const isCentered = align === "center";

  return (
    <div className={cn("max-w-3xl", isCentered && "mx-auto text-center")}>
      <span
        className={cn("public-clinic-line mb-5", isCentered && "mx-auto")}
        aria-hidden="true"
      />
      {eyebrow && (
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-primary">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-3xl font-semibold leading-tight text-foreground md:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
