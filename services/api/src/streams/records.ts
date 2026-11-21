import type { AttributeValue as LambdaAttributeValue, DynamoDBRecord } from 'aws-lambda';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Entity } from '../data/table';

/**
 * Event source mapping filters for the two stream consumers. CDK passes these
 * to `FilterCriteria` (each pattern JSON-stringified) so Lambda is only
 * invoked for relevant items; the local stream poller applies the same
 * patterns; and the handlers check `entity` again in case a filter is
 * misconfigured.
 */
const SEARCHABLE = [Entity.User, Entity.Number, Entity.Order];

export const STREAM_FILTER_PATTERNS = {
  orderNotifier: [{ dynamodb: { NewImage: { entity: { S: [Entity.Order] } } } }],
  searchIndexer: [
    { dynamodb: { NewImage: { entity: { S: SEARCHABLE } } } },
    { eventName: ['REMOVE'], dynamodb: { OldImage: { entity: { S: SEARCHABLE } } } },
  ],
} as const;

type Pattern = { readonly [key: string]: Pattern | readonly string[] };

/**
 * Minimal implementation of Lambda event filtering for the patterns above:
 * nested objects must match, and an array means "the value equals one of
 * these". Several patterns are OR-ed.
 */
export function matchesFilter(record: unknown, patterns: readonly Pattern[]): boolean {
  return patterns.some((pattern) => matchesPattern(record, pattern));
}

function matchesPattern(value: unknown, pattern: Pattern): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(pattern).every(([key, expected]) => {
    const actual = (value as Record<string, unknown>)[key];
    if (Array.isArray(expected)) return (expected as readonly string[]).includes(actual as string);
    return matchesPattern(actual, expected as Pattern);
  });
}

/** The new (or, for removals, old) image of a stream record as a plain object. */
export function recordImage(
  record: DynamoDBRecord,
  which: 'NewImage' | 'OldImage' = 'NewImage',
): Record<string, unknown> | undefined {
  const image = record.dynamodb?.[which] as Record<string, LambdaAttributeValue> | undefined;
  return image ? unmarshall(image as Record<string, AttributeValue>) : undefined;
}

export function entityOf(image: Record<string, unknown> | undefined): string | undefined {
  return typeof image?.entity === 'string' ? image.entity : undefined;
}
