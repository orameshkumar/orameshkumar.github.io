// Shared theme switcher — import and call attachThemeToggle() on any page
// that has a #theme-toggle-btn element.
//
// Theme is stored in localStorage as "clinic-queue-theme" and applied
// immediately on load so there's no flash of the wrong theme.

const THEMES = [
  { key: "light",    label: "Light",    icon: "☀️",  bodyClass: "" },
  { key: "dark",     label: "Dark",     icon: "🌙",  bodyClass: "theme-dark" },
  { key: "midnight", label: "Midnight", icon: "🌑",  bodyClass: "theme-midnight" },
  { key: "forest",   label: "Forest",   icon: "🌿",  bodyClass: "theme-forest" },
  { key: "sunset",   label: "Sunset",   icon: "🌅",  bodyClass: "theme-sunset" },
];

export function applyStoredTheme() {
  const stored = localStorage.getItem("clinic-queue-theme") || "light";
  const theme = THEMES.find((t) => t.key === stored) || THEMES[0];
  document.body.className = document.body.className
    .split(" ").filter((c) => !c.startsWith("theme-")).join(" ");
  if (theme.bodyClass) document.body.classList.add(theme.bodyClass);
  return theme;
}

export function attachThemeToggle(btnId = "theme-toggle-btn") {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  let current = applyStoredTheme();
  btn.textContent = current.icon;
  btn.title = `Theme: ${current.label} — click to switch`;

  btn.addEventListener("click", () => {
    const idx = THEMES.findIndex((t) => t.key === current.key);
    current = THEMES[(idx + 1) % THEMES.length];
    localStorage.setItem("clinic-queue-theme", current.key);
    document.body.className = document.body.className
      .split(" ").filter((c) => !c.startsWith("theme-")).join(" ");
    if (current.bodyClass) document.body.classList.add(current.bodyClass);
    btn.textContent = current.icon;
    btn.title = `Theme: ${current.label} — click to switch`;
  });
}
