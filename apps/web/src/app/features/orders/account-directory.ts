import { Signal, computed, inject } from '@angular/core';
import { Account, DeviceModel, PhoneNumber, Site, VoiceUser } from '@provisioning/contracts';
import { AccountsApi } from '../../core/api/accounts-api';
import { DevicesApi } from '../../core/api/devices-api';
import { NumbersApi } from '../../core/api/numbers-api';
import { SitesApi } from '../../core/api/sites-api';
import { UsersApi } from '../../core/api/users-api';

/**
 * Everything an order form needs to know about one account: its sites, every user
 * (to pick who to change or remove), its free numbers (to choose a DID) and the
 * device catalog. Loaded once per account; `ready` turns true when all of it is in.
 */
export interface AccountDirectory {
  readonly account: Signal<Account | undefined>;
  readonly sites: Signal<readonly Site[]>;
  readonly users: Signal<readonly VoiceUser[]>;
  readonly availableNumbers: Signal<readonly PhoneNumber[]>;
  readonly devices: Signal<readonly DeviceModel[]>;
  readonly ready: Signal<boolean>;
  /** The first load that failed, if any. */
  readonly error: Signal<unknown>;
  /** Retries whatever failed to load. */
  retry(): void;
}

/** Must run in an injection context. Idle while `accountId` returns undefined. */
export function accountDirectory(accountId: () => string | undefined): AccountDirectory {
  const account = inject(AccountsApi).get(accountId);
  const sites = inject(SitesApi).list(accountId);
  const users = inject(UsersApi).all(accountId);
  const numbers = inject(NumbersApi).available(accountId);
  const devices = inject(DevicesApi).catalog();
  const all: readonly {
    hasValue(): boolean;
    error(): unknown;
    reload(): boolean;
  }[] = [account, sites, users, numbers, devices];

  return {
    account: computed(() => (account.hasValue() ? account.value() : undefined)),
    sites: computed(() => (sites.hasValue() ? (sites.value()?.items ?? []) : [])),
    users: computed(() => (users.hasValue() ? users.value() : [])),
    availableNumbers: computed(() => (numbers.hasValue() ? numbers.value() : [])),
    devices: computed(() => (devices.hasValue() ? (devices.value()?.items ?? []) : [])),
    ready: computed(() => all.every((resource) => resource.hasValue())),
    error: computed(() => all.map((resource) => resource.error()).find(Boolean)),
    retry: () => {
      for (const resource of all) {
        if (resource.error()) {
          resource.reload();
        }
      }
    },
  };
}
