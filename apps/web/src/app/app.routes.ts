import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth-guards';
import { unsavedChangesGuard } from './core/navigation/unsaved-changes';

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
          import('./features/accounts/accounts-list/accounts-page').then((m) => m.AccountsPage),
      },
      // More specific account paths first: they share the `accounts/:accountId` prefix.
      {
        path: 'accounts/:accountId/orders/new',
        title: 'New order',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./features/orders/new-order/new-order-page').then((m) => m.NewOrderPage),
      },
      {
        path: 'accounts/:accountId/orders/:orderId',
        title: 'Order',
        loadComponent: () =>
          import('./features/orders/order-detail/order-detail-page').then((m) => m.OrderDetailPage),
      },
      {
        path: 'accounts/:accountId',
        title: 'Account',
        loadComponent: () =>
          import('./features/accounts/account-detail/account-detail-page').then(
            (m) => m.AccountDetailPage,
          ),
        loadChildren: () =>
          import('./features/accounts/account-detail/account-detail.routes').then(
            (m) => m.ACCOUNT_TAB_ROUTES,
          ),
      },
      {
        path: 'orders',
        title: 'Orders',
        loadComponent: () =>
          import('./features/orders/orders-list/orders-page').then((m) => m.OrdersPage),
      },
      {
        path: 'assistant',
        title: 'Assistant',
        canDeactivate: [unsavedChangesGuard],
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
