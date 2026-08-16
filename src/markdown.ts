import MarkdownIt from "markdown-it";
import { AppError } from "./http";

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: false,
});

markdown.disable(["heading", "hr", "image", "table", "strikethrough"]);

markdown.renderer.rules.link_open = (tokens, index, options, _environment, renderer) => {
  const token = tokens[index];
  if (token === undefined) {
    return "";
  }
  token.attrSet("rel", "nofollow ugc noreferrer noopener");
  return renderer.renderToken(tokens, index, options);
};

export function renderMarkdown(source: string): string {
  return markdown.render(source.trim());
}

export function enforceLinkBudget(body: string, maximumLinks: number): void {
  const links = body.match(/(?:https?:\/\/|www\.)[^\s<>()]+/giu) ?? [];
  if (links.length > maximumLinks) {
    throw new AppError(422, "LINK_LIMIT_EXCEEDED", `Use no more than ${maximumLinks} links in one contribution.`);
  }
}

export function markdownToText(source: string, maximumLength = 220): string {
  const normalized = source
    .replace(/```[\s\S]*?```/gu, " code ")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/!?\[([^\]]+)\]\([^\s)]+(?:\s+"[^"]*")?\)/gu, "$1")
    .replace(/^[>\-*+]\s+/gmu, "")
    .replace(/^\d+[.)]\s+/gmu, "")
    .replace(/[\\*_~#]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized.length <= maximumLength ? normalized : `${normalized.slice(0, maximumLength - 1).trimEnd()}…`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function highlightedSnippet(source: string, query: string, maximumLength = 260): string {
  const plain = markdownToText(source, maximumLength);
  const terms = Array.from(
    new Set(
      query
        .toLocaleLowerCase("en-US")
        .match(/[\p{L}\p{N}]{2,}/gu) ?? [],
    ),
  ).slice(0, 8);
  if (terms.length === 0) {
    return escapeHtml(plain);
  }
  const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|");
  const matcher = new RegExp(`(${pattern})`, "giu");
  return escapeHtml(plain).replace(matcher, "<mark>$1</mark>");
}
