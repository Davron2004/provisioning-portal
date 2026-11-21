import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth-guards';

/**
 * Every page is a lazily loaded standalone component. Route parameters and query
 * parameters arrive as component inputs (withComponentInputBinding), and `title`
 * feeds the document title (AppTitleStrategy).
 */
export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        title: 'Overview',
        loadComponent: () =>
          import('./features/overview/overview-page').then((m) => m.OverviewPage),
      },
      {
        path: 'accounts',
        title: 'Accounts',
        loadComponent: () =>
          import('./features/accounts/accounts-page').then((m) => m.AccountsPage),
      },
      {
        path: 'accounts/:accountId',
        title: 'Account',
        loadComponent: () =>
          import('./features/accounts/account-detail-page').then((m) => m.AccountDetailPage),
      },
      {
        path: 'accounts/:accountId/orders/:orderId',
        title: 'Order',
        loadComponent: () =>
          import('./features/orders/order-detail-page').then((m) => m.OrderDetailPage),
      },
      {
        path: 'orders',
        title: 'Orders',
        loadComponent: () => import('./features/orders/orders-page').then((m) => m.OrdersPage),
      },
      {
        path: 'assistant',
        title: 'Assistant',
        loadComponent: () =>
          import('./features/assistant/assistant-page').then((m) => m.AssistantPage),
      },
      {
        path: 'search',
        title: 'Search',
        loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
      },
      {
        path: '**',
        title: 'Page not found',
        loadComponent: () =>
          import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
