import { Routes } from '@angular/router';

/** Tabs of the account page; each is a URL, so a tab (and its filters) can be linked to. */
export const ACCOUNT_TAB_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  {
    path: 'users',
    title: 'Users',
    loadComponent: () => import('./users-tab/users-tab').then((m) => m.UsersTab),
  },
  {
    path: 'sites',
    title: 'Sites',
    loadComponent: () => import('./sites-tab/sites-tab').then((m) => m.SitesTab),
  },
  {
    path: 'numbers',
    title: 'Numbers',
    loadComponent: () => import('./numbers-tab/numbers-tab').then((m) => m.NumbersTab),
  },
  {
    path: 'orders',
    title: 'Orders',
    loadComponent: () => import('./orders-tab/orders-tab').then((m) => m.OrdersTab),
  },
];
