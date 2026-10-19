export type OAuthProvider = "google" | "facebook" | "x";

export const OAUTH_PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X" },
];

// A failed or cancelled provider redirect lands back on our page with the
// reason in the query string or hash. Returns it once and strips it from the URL.
export function consumeAuthRedirectError(): string | null {
  const params = new URLSearchParams(
    window.location.search || window.location.hash.replace(/^#/, "")
  );
  const description = params.get("error_description");
  if (!description) return null;
  window.history.replaceState(null, "", window.location.pathname);
  return description.replace(/\+/g, " ");
}
