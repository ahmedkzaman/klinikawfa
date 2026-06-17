import * as React from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";

interface ComboboxInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export function ComboboxInput({
  value,
  onChange,
  options,
  placeholder = "Type or select...",
  className,
}: ComboboxInputProps) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const interactingRef = React.useRef(false);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes((value || "").toLowerCase()),
  );

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          value={value || ""}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            if (!interactingRef.current) setOpen(false);
          }}
          placeholder={placeholder}
          className={cn("h-8 text-sm mt-1", className)}
          autoComplete="off"
        />
      </PopoverAnchor>
      {filtered.length > 0 && (
        <PopoverContent
          className="p-0 w-[--radix-popover-trigger-width]"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            if (!inputRef.current?.contains(e.target as Node)) setOpen(false);
          }}
        >
          <Command shouldFilter={false}>
            <CommandList>
              <CommandGroup>
                {filtered.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      interactingRef.current = true;
                    }}
                    onSelect={() => {
                      onChange(option);
                      setOpen(false);
                      interactingRef.current = false;
                      inputRef.current?.focus();
                    }}
                    className="text-sm cursor-pointer"
                  >
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  );
}
