import type { ConferencesResult, PaperListResult, PaperResult } from "../client/types.js";
import { emitText } from "./emit.js";
import { sanitizeText } from "./sanitize.js";

function line(...parts: unknown[]): string {
  return parts
    .filter((p) => p !== undefined && p !== null && String(p).length > 0)
    .map((p) => sanitizeText(p, { allowNewlines: false }))
    .join("  ");
}

export function printConferences(result: ConferencesResult): void {
  const rows = result.conferences ?? [];
  if (rows.length === 0) {
    emitText("No conferences found.");
    return;
  }
  emitText(`Conferences (${rows.length}):`);
  for (const c of rows) {
    const years = Array.isArray(c.years) ? c.years.join(", ") : "";
    const domains = Array.isArray(c.domains) ? c.domains.join(", ") : "";
    emitText(
      line(
        "-",
        c.slug,
        "—",
        c.name || c.full_name,
        years ? `(${years})` : "",
        domains ? `[${domains}]` : "",
      ),
    );
  }
  const topics = result.topics;
  if (topics) {
    emitText("");
    emitText(
      `Topics for ${topics.conference} ${topics.year}` +
        (topics.paper_total != null ? ` (${topics.paper_total} papers)` : "") +
        ":",
    );
    if (topics.note) emitText(topics.note);
    for (const item of topics.items ?? []) {
      emitText(line(" ", item.slug, "—", item.name, `(${item.paper_count})`));
    }
  }
}

function venueOf(paper: Record<string, unknown>): string {
  const conf = paper.conference;
  if (typeof conf === "string") {
    const year = paper.year != null ? String(paper.year) : "";
    return line(conf, year);
  }
  if (conf && typeof conf === "object") {
    const c = conf as { slug?: string; name?: string; year?: number };
    return line(c.slug ?? c.name, c.year != null ? String(c.year) : undefined);
  }
  return "";
}

function topicsOf(paper: Record<string, unknown>): string {
  const topics = paper.topics;
  if (!Array.isArray(topics) || topics.length === 0) return "";
  return topics
    .map((t) =>
      typeof t === "string"
        ? t
        : ((t as { slug?: string; name?: string })?.slug ?? (t as { name?: string })?.name),
    )
    .filter(Boolean)
    .join(", ");
}

export function printPaperList(result: PaperListResult, commandHint: string): void {
  const papers = result.papers ?? [];
  if (papers.length === 0) {
    emitText("No papers found.");
    if (result.note) emitText(result.note);
    emitText(
      result.paging.has_more
        ? `More results exist. Re-run with --cursor ${result.paging.next_cursor}.`
        : "No more pages.",
    );
    return;
  }
  const total = result.total != null ? ` of ${result.total}` : "";
  emitText(`Papers (${papers.length}${total}):`);
  for (const raw of papers) {
    const p = (raw ?? {}) as Record<string, unknown>;
    emitText("");
    emitText(line("*", p.title ?? "(untitled)"));
    emitText(line("  id:", p.id));
    const meta = line(
      venueOf(p),
      p.decision as string | undefined,
      p.rating_avg != null ? `rating ${p.rating_avg}` : undefined,
    );
    if (meta) emitText(`  ${meta}`);
    const topics = topicsOf(p);
    if (topics) emitText(`  topics: ${topics}`);
    if (typeof p.url === "string" && p.url) emitText(`  url: ${p.url}`);
    if (typeof p.abstract === "string" && p.abstract.trim()) {
      emitText("  abstract:");
      emitText(indent(p.abstract));
    }
  }
  emitText("");
  if (result.note) emitText(result.note);
  if (result.paging.has_more) {
    emitText(`More results: ${commandHint} --cursor ${result.paging.next_cursor}`);
  } else {
    emitText("No more pages.");
  }
}

export function printPaper(result: PaperResult): void {
  const p = result.paper;
  emitText(sanitizeText(p.title ?? "(untitled)"));
  emitText(line("id:", p.id));
  const meta = line(
    venueOf(p),
    p.decision as string | undefined,
    p.rating_avg != null ? `rating ${p.rating_avg}` : undefined,
  );
  if (meta) emitText(meta);
  if (Array.isArray(p.authors) && p.authors.length)
    emitText(`authors: ${p.authors.map((a) => sanitizeText(a)).join(", ")}`);
  const topics = topicsOf(p);
  if (topics) emitText(`topics: ${topics}`);
  if (typeof p.citation_count === "number") emitText(`citations: ${p.citation_count}`);
  const links =
    p.links && typeof p.links === "object" ? (p.links as Record<string, unknown>) : undefined;
  const url = (links?.paperlist as string) || (typeof p.url === "string" ? p.url : undefined);
  if (url) emitText(`url: ${url}`);
  if (links) {
    for (const key of ["paper", "pdf", "code", "doi", "openreview"]) {
      const v = links[key];
      if (typeof v === "string" && v) emitText(`${key}: ${v}`);
    }
  }
  if (typeof p.abstract === "string" && p.abstract.trim()) {
    emitText("");
    emitText("Abstract:");
    emitText(sanitizeText(p.abstract, { allowNewlines: true }));
  }
  if (typeof p.review_summary === "string" && p.review_summary.trim()) {
    emitText("");
    emitText("Review summary:");
    emitText(sanitizeText(p.review_summary, { allowNewlines: true }));
  } else {
    emitText("");
    emitText("Review summary: (not available for this paper)");
  }
  if (result.note) {
    emitText("");
    emitText(result.note);
  }
}

export function printGeneric(data: unknown): void {
  emitText(JSON.stringify(data, null, 2));
}

function indent(text: string): string {
  return sanitizeText(text, { allowNewlines: true })
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
}
