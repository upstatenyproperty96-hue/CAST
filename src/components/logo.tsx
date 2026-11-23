export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-3xl font-bold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <path d="M8 4.5v23a2 2 0 0 0 3 1.7l19-11.5a2 2 0 0 0 0-3.4L11 2.8a2 2 0 0 0-3 1.7z" fill="#2563eb" />
      </svg>
      Cast
    </span>
  );
}
