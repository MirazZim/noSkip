export type OAuthProvider = "google" | "facebook" | "x";

export const OAUTH_PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X" },
];

// A failed or cancelled provider redirect lands back on our page with the
// reason in the query string or hash. Returns it once and strips the error from
// the URL, keeping any other query params (e.g. ?tab=accounts).
export function consumeAuthRedirectError(): string | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description = search.get("error_description") ?? hash.get("error_description");
  if (!description) return null;
  ["error", "error_code", "error_description"].forEach((k) => search.delete(k));
  const query = search.toString();
  window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
  return description.replace(/\+/g, " ");
}
