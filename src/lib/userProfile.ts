import type { User } from "@supabase/supabase-js";

// Profile fields live in user_metadata, which Supabase fills from whichever
// provider the user last signed in with. An account created with email and later
// linked to Google has them only on the Google identity, so fall back to those.
function profileSources(user: User | null): Record<string, string | undefined>[] {
  if (!user) return [];
  return [user.user_metadata ?? {}, ...(user.identities ?? []).map((i) => i.identity_data ?? {})];
}

function firstField(user: User | null, keys: string[]): string | undefined {
  for (const source of profileSources(user)) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return undefined;
}

// A name the user typed is kept under its own `display_name` key (Supabase
// overwrites full_name / name on every OAuth sign-in), so it wins.
export function getDisplayName(user: User | null): string {
  return (
    user?.user_metadata?.display_name ||
    firstField(user, ["full_name", "name", "user_name"]) ||
    user?.email?.split("@")[0] ||
    "You"
  );
}

export function getAvatarUrl(user: User | null): string | undefined {
  return firstField(user, ["avatar_url", "picture"]);
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
