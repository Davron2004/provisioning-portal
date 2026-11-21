import type { Client } from '@opensearch-project/opensearch';
import type { SearchEntity, SearchHit, SearchResponse } from '@provisioning/contracts';
import type { SearchDocument } from './documents';

export interface SearchParams {
  q: string;
  entity?: SearchEntity | undefined;
  accountId?: string | undefined;
  limit: number;
}

/**
 * Highlight markers that cannot appear in indexed text; swapped for <mark>
 * after escaping. Private-use code points, not control characters: the
 * highlighter trims fragments with Java's trim(), which strips anything
 * at or below U+0020.
 */
const PRE = '\uE000';
const POST = '\uE001';

/**
 * The OpenSearch query for the global search box:
 *  - names and titles match as you type (`bool_prefix` over the
 *    search_as_you_type subfields), boosted;
 *  - emails, sites, accounts, order ids and prompts match by word (the
 *    last word as a prefix);
 *  - when the query has 3+ digits, its digits match the n-gram field, so a
 *    partial or formatted phone number or an extension finds its user and
 *    number.
 * Entity and account are filters, not scoring clauses.
 */
export function buildSearchQuery(params: SearchParams) {
  const q = params.q.trim();
  const digits = q.replace(/\D/g, '');
  const should: object[] = [
    {
      multi_match: {
        query: q,
        type: 'bool_prefix',
        fields: ['title^3', 'title._2gram^3', 'title._3gram^3'],
        operator: 'and',
      },
    },
    {
      multi_match: { query: q, type: 'bool_prefix', fields: ['subtitle', 'text'], operator: 'and' },
    },
  ];
  if (digits.length >= 3) should.push({ term: { digits: { value: digits, boost: 2 } } });
  const filter: object[] = [];
  if (params.entity) filter.push({ term: { entity: params.entity } });
  if (params.accountId) filter.push({ term: { accountId: params.accountId } });

  return {
    size: params.limit,
    track_total_hits: true,
    query: { bool: { should, minimum_should_match: 1, filter } },
    highlight: {
      pre_tags: [PRE],
      post_tags: [POST],
      require_field_match: false,
      number_of_fragments: 1,
      fragment_size: 120,
      // bool_prefix so "sof" marks "Sofia", the same way the query matched it.
      highlight_query: {
        multi_match: { query: q, type: 'bool_prefix', fields: ['title', 'subtitle'] },
      },
      fields: { title: {}, subtitle: {} },
    },
  };
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes a highlighted fragment for HTML and turns the markers into <mark>.
 * Indexed text is user-controlled (names, prompts), so nothing but <mark>
 * may survive.
 */
export function safeHighlight(fragment: string): string {
  return fragment
    .replace(/[&<>"']/g, (c) => ESCAPES[c]!)
    .replaceAll(PRE, '<mark>')
    .replaceAll(POST, '</mark>');
}

interface RawHit {
  _source?: SearchDocument;
  highlight?: Record<string, string[]>;
}

export function toSearchHit(hit: RawHit): SearchHit | null {
  const doc = hit._source;
  if (!doc) return null;
  const fragment = hit.highlight?.title?.[0] ?? hit.highlight?.subtitle?.[0];
  return {
    entity: doc.entity,
    id: doc.id,
    accountId: doc.accountId,
    accountName: doc.accountName,
    title: doc.title,
    subtitle: doc.subtitle,
    status: doc.status,
    highlight: fragment ? safeHighlight(fragment) : null,
  };
}

export class SearchService {
  constructor(
    private readonly client: Client,
    private readonly index: string,
  ) {}

  async search(params: SearchParams): Promise<SearchResponse> {
    const started = Date.now();
    let response;
    try {
      response = await this.client.search({
        index: this.index,
        body: buildSearchQuery(params) as never,
      });
    } catch (error) {
      // Before the first write there is no index yet: that is "no results", not an outage.
      if (errorType(error) === 'index_not_found_exception') {
        return { query: params.q, total: 0, hits: [], tookMs: Date.now() - started };
      }
      throw error;
    }
    const body = response.body as unknown as {
      took?: number;
      hits: { total?: number | { value: number }; hits: RawHit[] };
    };
    const total =
      typeof body.hits.total === 'number' ? body.hits.total : (body.hits.total?.value ?? 0);
    return {
      query: params.q,
      total,
      hits: body.hits.hits.map(toSearchHit).filter((h): h is SearchHit => h !== null),
      tookMs: body.took ?? Date.now() - started,
    };
  }
}

function errorType(error: unknown): string | undefined {
  return (error as { meta?: { body?: { error?: { type?: string } } } }).meta?.body?.error?.type;
}
