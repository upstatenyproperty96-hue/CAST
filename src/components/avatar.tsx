type P = { display_name: string; avatar_url: string | null } | null;

// Initials fall back to a gradient picked from the name, so empty avatars don't all look the same.
const gradients = [
  "from-blue-500 to-indigo-700", "from-pink-500 to-orange-400", "from-emerald-400 to-cyan-600",
  "from-violet-500 to-fuchsia-500", "from-amber-400 to-rose-500", "from-sky-400 to-blue-700",
];

export function Avatar({ profile, size = 40 }: { profile: P; size?: number }) {
  const name = profile?.display_name?.trim() ?? "";
  const initial = name[0]?.toUpperCase() ?? "?";
  const g = gradients[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % gradients.length];
  return profile?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={profile.avatar_url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${g} font-bold text-white`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial}
    </span>
  );
}
