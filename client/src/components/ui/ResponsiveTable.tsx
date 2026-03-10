import { cn } from "@/lib/utils";

interface ResponsiveTableProps {
  headers: string[];
  children: React.ReactNode;
  className?: string;
}

export function ResponsiveTable({ headers, children, className }: ResponsiveTableProps) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-lg border border-[var(--g-border-subtle)]", className)}>
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b border-[var(--g-border-subtle)] bg-[var(--g-bg-inset)]">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left font-medium whitespace-nowrap"
                style={{ color: "var(--g-text-secondary)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--g-border-subtle)]">
          {children}
        </tbody>
      </table>
    </div>
  );
}

interface ResponsiveTableRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function ResponsiveTableRow({ children, className, onClick }: ResponsiveTableRowProps) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-[var(--g-bg-surface)]",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

interface ResponsiveTableCellProps {
  children: React.ReactNode;
  className?: string;
}

export function ResponsiveTableCell({ children, className }: ResponsiveTableCellProps) {
  return (
    <td className={cn("px-4 py-3 whitespace-nowrap", className)} style={{ color: "var(--g-text-primary)" }}>
      {children}
    </td>
  );
}
