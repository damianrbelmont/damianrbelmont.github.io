const toggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".mobile-nav");
const close = navigation?.querySelector(".menu-close");

if (toggle && navigation && close) {
  const focusable = () => [close, ...navigation.querySelectorAll("a[href]")];
  const setOpen = (open, restoreFocus = true) => {
    navigation.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("menu-open", open);
    if (open) focusable()[1]?.focus();
    else if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener("click", () => setOpen(true));
  close.addEventListener("click", () => setOpen(false));
  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false, false);
  });
  document.addEventListener("keydown", (event) => {
    if (navigation.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusable();
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

const sectionToggles = [...document.querySelectorAll(".section-toggle")];
const setSectionOpen = (button, open) => {
  const body = document.getElementById(button.getAttribute("aria-controls"));
  if (!body) return;
  body.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", `${open ? "Plegar" : "Desplegar"} ${button.dataset.sectionTitle}`);
  button.querySelector(".section-toggle-symbol").textContent = open ? "▲" : "▼";
};

const revealSection = (hash, scroll = false) => {
  if (!hash?.startsWith("#")) return;
  let id;
  try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
  const section = document.getElementById(id)?.closest(".wiki-section");
  const button = section?.querySelector(".section-toggle");
  if (!section || !button) return;
  setSectionOpen(button, true);
  if (scroll) requestAnimationFrame(() => section.scrollIntoView({ block: "start" }));
};

for (const button of sectionToggles) {
  button.addEventListener("click", () => setSectionOpen(button, button.getAttribute("aria-expanded") !== "true"));
  button.closest(".section-heading")?.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    button.click();
  });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest(".toc-link[href^='#']");
  if (link) revealSection(link.hash);
});
window.addEventListener("hashchange", () => revealSection(window.location.hash, true));
revealSection(window.location.hash, true);
