import { describe, expect, it } from 'vitest';
import { matchesFilter, STREAM_FILTER_PATTERNS } from './records';

const image = (entity: string) => ({ entity: { S: entity }, PK: { S: 'x' } });

describe('stream filter patterns', () => {
  it('sends only order changes to the notifier', () => {
    const { orderNotifier } = STREAM_FILTER_PATTERNS;
    expect(
      matchesFilter({ eventName: 'MODIFY', dynamodb: { NewImage: image('Order') } }, orderNotifier),
    ).toBe(true);
    expect(
      matchesFilter({ eventName: 'INSERT', dynamodb: { NewImage: image('User') } }, orderNotifier),
    ).toBe(false);
    expect(
      matchesFilter({ eventName: 'REMOVE', dynamodb: { OldImage: image('Order') } }, orderNotifier),
    ).toBe(false);
  });

  it('sends user, number and order changes, including removals, to the indexer', () => {
    const { searchIndexer } = STREAM_FILTER_PATTERNS;
    expect(
      matchesFilter(
        { eventName: 'INSERT', dynamodb: { NewImage: image('Number') } },
        searchIndexer,
      ),
    ).toBe(true);
    expect(
      matchesFilter({ eventName: 'REMOVE', dynamodb: { OldImage: image('User') } }, searchIndexer),
    ).toBe(true);
    expect(
      matchesFilter({ eventName: 'INSERT', dynamodb: { NewImage: image('Guard') } }, searchIndexer),
    ).toBe(false);
    expect(
      matchesFilter(
        { eventName: 'REMOVE', dynamodb: { OldImage: image('Connection') } },
        searchIndexer,
      ),
    ).toBe(false);
  });
});
