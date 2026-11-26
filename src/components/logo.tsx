export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-3xl font-extrabold tracking-tight text-neutral-950 ${className}`}>
      <span className="bg-brand flex h-8 w-8 items-center justify-center rounded-[9px]" aria-hidden="true">
        <svg viewBox="0 0 32 32" className="h-8 w-8">
          <path d="M12 9.5v13a1.2 1.2 0 0 0 1.8 1l10.4-6.5a1.2 1.2 0 0 0 0-2L13.8 8.5a1.2 1.2 0 0 0-1.8 1z" fill="#fff" />
        </svg>
      </span>
      Cast
    </span>
  );
}
