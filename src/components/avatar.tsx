type P = { display_name: string; avatar_url: string | null } | null;

export function Avatar({ profile, size = 40 }: { profile: P; size?: number }) {
  const initial = profile?.display_name?.trim()?.[0]?.toUpperCase() ?? "?";
  return profile?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={profile.avatar_url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700" style={{ width: size, height: size }}>
      {initial}
    </span>
  );
}
