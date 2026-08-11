import type { WebsiteDestination } from "@/features/website-cms/catalogue/domain";

interface DestinationPickerProps {
  destinations: WebsiteDestination[];
  value: string;
  onSelect: (destination: WebsiteDestination) => void;
}

export function DestinationPicker({ destinations, value, onSelect }: DestinationPickerProps) {
  return (
    <select
      aria-label="Choose website page"
      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      value={destinations.some((item) => item.href === value) ? value : ""}
      onChange={(event) => {
        const destination = destinations.find((item) => item.href === event.target.value);
        if (destination) onSelect(destination);
      }}
    >
      <option value="">Custom URL / choose a page</option>
      {(["fixed", "service", "post", "page"] as const).map((type) => {
        const options = destinations.filter((item) => item.type === type && item.status !== "trash");
        if (!options.length) return null;
        return <optgroup key={type} label={{ fixed: "Website pages", service: "Services", post: "Health tips", page: "Other pages" }[type]}>
          {options.map((item) => <option key={item.id} value={item.href}>{item.titleMs} — {item.href}{item.status !== "published" ? ` (${item.status})` : ""}</option>)}
        </optgroup>;
      })}
    </select>
  );
}
