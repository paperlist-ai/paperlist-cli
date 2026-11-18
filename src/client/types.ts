export type SortOrder = "relevance" | "citations" | "newest";
export type FieldSet = "slim" | "full";

export interface TopicsFor {
  conference: string;
  year: number;
}

export interface SearchPapersInput {
  query?: string;
  conferences?: string[];
  year_from?: number;
  year_to?: number;
  decision?: string[];
  topic?: string;
  author?: string;
  sort?: SortOrder;
  fields?: FieldSet;
  limit?: number;
  cursor?: string;
}

export interface ListPapersInput {
  conference: string;
  year: number;
  decision?: string[];
  topic?: string;
  fields?: FieldSet;
  limit?: number;
  cursor?: string;
}

export interface SimilarPapersInput {
  id: string;
  conferences?: string[];
  year_from?: number;
  year_to?: number;
  fields?: FieldSet;
  limit?: number;
  cursor?: string;
}

export interface Paging {
  next_cursor: string | null;
  has_more: boolean;
}

export interface PaperListResult {
  papers: unknown[];
  paging: Paging;
  note?: string;
  fields?: string;
  total?: number | null;
  conference?: string;
  year?: number;
}

export interface PaperResult {
  paper: Record<string, unknown>;
  note?: string;
}

export interface ConferencesResult {
  conferences: Array<{
    slug: string;
    name: string;
    full_name: string;
    years: number[];
    domains: string[];
  }>;
  topics?: {
    conference: string;
    year: number;
    paper_total: number | null;
    scored_count?: number;
    note?: string;
    items: Array<{ slug: string; name: string; paper_count: number }>;
  };
}
