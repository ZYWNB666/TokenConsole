/**
 * Brand and product metadata. Kept outside rendering components so the
 * shell stays presentational (see ARCHITECTURE.md).
 */
export const brand = {
  name: "TokenAPI",
  tagline: "AI Infrastructure",
  /** Public demo API endpoint shown in the console header. */
  apiEndpoint: "api.xxx.com",
} as const;
