// The interface shipped light only: a dark palette existed at the top of the
// stylesheet but every one of its values was overridden by the planning-office
// paper palette below it, so it never reached a screen. It was also incomplete
// (no blueprint, focus or ink-soft), so the dark theme here is a dark reading
// of the current design language rather than that palette brought back.
export const THEMES = Object.freeze(['auto', 'light', 'dark']);

export function isTheme(value) {
  return THEMES.includes(value);
}

// 'auto' follows the operating system, which is what most people mean by
// "dark mode" — the explicit settings exist for anyone whose system preference
// does not match how they want to read this particular tool.
export function resolveTheme(preference, prefersDark = false) {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

// The root attribute is what the stylesheet keys off. 'auto' deliberately
// clears it so the media query decides, rather than pinning a value that would
// stop tracking the system as it changes.
export function themeAttribute(preference) {
  return preference === 'dark' || preference === 'light' ? preference : null;
}

export function nextTheme(preference) {
  const index = THEMES.indexOf(preference);
  return THEMES[(index + 1) % THEMES.length] ?? 'auto';
}
