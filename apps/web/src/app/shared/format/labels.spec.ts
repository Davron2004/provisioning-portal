import { aDevice } from '../../../testing/fixtures';
import { countOf, deviceName, orderProgressLabel, resultCountLabel } from './labels';

describe('resultCountLabel', () => {
  it.each([
    [[5, 5, false, 'account'], '5 accounts'],
    [[1, 1, false, 'account'], '1 account'],
    [[25, 25, true, 'user', 91], '25 of 91 users'],
    [[25, 25, true, 'user'], 'First 25 users'],
    [[3, 5, false, 'account'], '3 of 5 accounts'],
    [[1, 25, true, 'user'], '1 match in the first 25 users'],
    [[4, 25, true, 'user', 91], '4 matches in the first 25 users'],
  ] as const)('%j reads "%s"', (args, expected) => {
    const [shown, loaded, hasMore, noun, total] = args as unknown as [
      number,
      number,
      boolean,
      string,
      number | undefined,
    ];
    expect(resultCountLabel(shown, loaded, hasMore, noun, total)).toBe(expected);
  });

  it('formats large numbers with separators', () => {
    expect(resultCountLabel(1200, 1200, false, 'number')).toBe('1,200 numbers');
  });
});

describe('orderProgressLabel', () => {
  const counts = { total: 3, pending: 0, provisioning: 0, succeeded: 2, failed: 0 };

  it('leads with failures', () => {
    expect(orderProgressLabel({ status: 'failed', counts: { ...counts, failed: 1 } })).toBe(
      '1 of 3 failed',
    );
  });

  it('counts lines before work starts, then completed lines', () => {
    expect(orderProgressLabel({ status: 'submitted', counts })).toBe('3 lines');
    expect(orderProgressLabel({ status: 'provisioning', counts })).toBe('2 of 3 done');
  });
});

describe('deviceName', () => {
  it('names a model from the catalog, falling back to its id', () => {
    const catalog = [aDevice()];
    expect(deviceName(catalog, 'dev_d200')).toBe('D200 desk phone');
    expect(deviceName(catalog, 'dev_retired')).toBe('dev_retired');
    expect(deviceName(undefined, 'dev_d200')).toBe('dev_d200');
    expect(deviceName(catalog, null)).toBeNull();
  });
});

describe('countOf', () => {
  it('pluralizes', () => {
    expect(countOf(1, 'site')).toBe('1 site');
    expect(countOf(0, 'site')).toBe('0 sites');
  });
});
