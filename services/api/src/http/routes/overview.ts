import type { DeviceCatalog, Overview } from '@provisioning/contracts';
import { DEVICE_CATALOG } from '../../domain/catalog';
import type { Router } from '../router';
import type { ApiDeps } from '../deps';

const RECENT_ORDERS = 8;

export function registerOverviewRoutes(router: Router, deps: ApiDeps): void {
  router.get('/overview', async () => {
    // Account items carry maintained counters, so the overview is a sum over
    // accounts plus one COUNT query per order status.
    const [accounts, ordersByStatus, recent] = await Promise.all([
      deps.accounts.listAll(),
      deps.orders.countByStatus(),
      deps.orders.listAll({ limit: RECENT_ORDERS }),
    ]);
    const sum = (pick: (a: (typeof accounts)[number]) => number) =>
      accounts.reduce((total, a) => total + pick(a), 0);
    const body: Overview = {
      accounts: accounts.length,
      sites: sum((a) => a.siteCount),
      users: sum((a) => a.userCount),
      numbersAssigned: sum((a) => a.numbersAssigned),
      numbersAvailable: sum((a) => a.numbersTotal - a.numbersAssigned),
      ordersByStatus,
      recentOrders: recent.items,
      generatedAt: deps.now().toISOString(),
    };
    return { status: 200, body };
  });

  router.get('/catalog/devices', async () => {
    const body: DeviceCatalog = { items: [...DEVICE_CATALOG] };
    return { status: 200, body };
  });
}
