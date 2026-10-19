// Apple system colors (dark appearance). Used for meaning (done / missed /
// streak / warning) so they stay constant across NoSkip themes; structure and
// the user's accent come from the theme's CSS variables.
export const MAC = {
  green: "#30D158",
  red: "#FF453A",
  orange: "#FF9F0A",
  yellow: "#FFD60A",
  blue: "#0A84FF",
  purple: "#BF5AF2",
  pink: "#FF375F",
  teal: "#64D2FF",
} as const;

export const PRIMARY = "hsl(var(--primary))";

// San Francisco on Apple devices, Inter elsewhere.
export const SF_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif';
