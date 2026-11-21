import type { CdkCustomResourceEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { createSeedHandler } from './seed-demo-data';

const base = {
  ServiceToken: 'token',
  ResponseURL: 'https://example.com',
  StackId: 'stack',
  RequestId: 'req',
  LogicalResourceId: 'DemoData',
  ResourceType: 'Custom::DemoData',
  ResourceProperties: { ServiceToken: 'token' },
};

function seeder(empty: boolean) {
  return {
    isEmpty: vi.fn(async () => empty),
    seed: vi.fn(async () => ({ accounts: 5, users: 190, orders: 20 })),
  };
}

describe('seed-demo-data custom resource', () => {
  it('seeds an empty table when the stack is created', async () => {
    const s = seeder(true);
    const result = await createSeedHandler(s)({ ...base, RequestType: 'Create' });
    expect(s.seed).toHaveBeenCalledOnce();
    expect(result).toEqual({ PhysicalResourceId: 'demo-data', Data: { Seeded: 'true' } });
  });

  it('leaves a table that already has data alone', async () => {
    const s = seeder(false);
    const result = await createSeedHandler(s)({ ...base, RequestType: 'Create' });
    expect(s.seed).not.toHaveBeenCalled();
    expect(result.Data).toEqual({ Seeded: 'false' });
  });

  it.each(['Update', 'Delete'] as const)('does nothing on %s', async (RequestType) => {
    const s = seeder(true);
    const event = {
      ...base,
      RequestType,
      PhysicalResourceId: 'demo-data',
      OldResourceProperties: {},
    } as CdkCustomResourceEvent;
    expect(await createSeedHandler(s)(event)).toEqual({ PhysicalResourceId: 'demo-data' });
    expect(s.isEmpty).not.toHaveBeenCalled();
    expect(s.seed).not.toHaveBeenCalled();
  });
});
