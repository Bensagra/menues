import { cn } from "cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" fill="#214E3B" />
      <rect x="9" y="7" width="14" height="18" rx="2.5" fill="#F7F5EF" />
      <rect x="12" y="11" width="8" height="1.8" rx="0.9" fill="#214E3B" />
      <rect x="12" y="15" width="6" height="1.8" rx="0.9" fill="#626B64" />
      <rect x="12" y="19" width="7" height="1.8" rx="0.9" fill="#626B64" />
      <circle cx="23" cy="24" r="4" fill="#B65335" stroke="#214E3B" strokeWidth="1.5" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-bold text-foreground", className)}>
      <LogoMark />
      {!compact && <span className="text-[17px] tracking-tight">CartaLista</span>}
    </span>
  );
}
