"use client";

import { useState } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatPhone(phone?: string) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

export interface Sender {
  id: number;
  userId?: number;
  name: string;
  phone?: string;
}

export interface SenderPickerProps {
  value: Sender | null;
  onChange: (sender: Sender | null) => void;
  teamMembers: Sender[];
}

export function SenderPicker({ value, onChange, teamMembers }: SenderPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? (
            <span>{value.name}{value.phone ? ` — ${formatPhone(value.phone)}` : ""}</span>
          ) : (
            <span className="text-muted-foreground">Select sender...</span>
          )}
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name..." />
          <CommandList>
            <CommandEmpty>No sender found.</CommandEmpty>
            <CommandGroup>
              {teamMembers.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.name}
                  onSelect={() => {
                    const key = (v: Sender) => v.userId ?? v.id;
                    onChange(value && key(value) === key(m) ? null : { ...m, userId: m.userId ?? m.id });
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn("mr-2 size-4", value?.id === m.id ? "opacity-100" : "opacity-0")}
                  />
                  {m.name}
                  {m.phone && (
                    <span className="ml-2 text-muted-foreground">— {formatPhone(m.phone)}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
