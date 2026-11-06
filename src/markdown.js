// Markdown <-> HTML conversion and sanitization.

marked.setOptions({ gfm: true, breaks: true });

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});

export function sanitize(html) {
  return DOMPurify.sanitize(html || "");
}

export function mdToHtml(md) {
  const raw = marked.parse(md || "");
  const clean = sanitize(raw);
  const tpl = document.createElement("template");
  tpl.innerHTML = clean;
  tpl.content.querySelectorAll("a[href]").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  return tpl.innerHTML;
}

export function htmlToMd(html) {
  if (!html) return "";
  try {
    return turndownService.turndown(html);
  } catch {
    return "";
  }
}

export function textOf(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html || "";
  // Separate block-level elements so their text doesn't run together.
  tpl.content
    .querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,li,tr,blockquote,pre,hr")
    .forEach((el) => el.append(" "));
  return (tpl.content.textContent || "").replace(/\s+/g, " ").trim();
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
