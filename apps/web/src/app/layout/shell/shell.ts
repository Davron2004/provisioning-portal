import { BreakpointObserver } from '@angular/cdk/layout';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { BrandMark } from '../../shared/ui/brand-mark/brand-mark';
import { ConnectionStatus } from '../connection-status/connection-status';
import { GlobalSearch } from '../global-search/global-search';
import { SideNav } from '../side-nav/side-nav';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { UserMenu } from '../user-menu/user-menu';

/** Below this width the navigation becomes a drawer over the content. */
const COMPACT_QUERY = '(max-width: 959.98px)';
const NAV_COLLAPSED_KEY = 'pp.nav-collapsed';

/** The signed-in layout: toolbar, navigation, and the routed page in <main>. */
@Component({
  selector: 'app-shell',
  imports: [
    BrandMark,
    ConnectionStatus,
    GlobalSearch,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatToolbarModule,
    MatTooltipModule,
    RouterLink,
    RouterOutlet,
    SideNav,
    ThemeToggle,
    UserMenu,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly storage = inject(DOCUMENT).defaultView?.localStorage;
  private readonly injector = inject(Injector);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly content = viewChild.required('content', { read: ElementRef<HTMLElement> });

  protected readonly compact = toSignal(
    inject(BreakpointObserver)
      .observe(COMPACT_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  /** Desktop: icon-only rail instead of the full navigation. */
  protected readonly railCollapsed = signal(this.readCollapsed());
  /** Compact: the drawer is open. */
  protected readonly drawerOpen = signal(false);

  protected readonly navExpanded = computed(() =>
    this.compact() ? this.drawerOpen() : !this.railCollapsed(),
  );

  constructor() {
    effect(() => this.storeCollapsed(this.railCollapsed()));

    let previousPath: string | null = null;
    inject(Router)
      .events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const path = event.urlAfterRedirects.split(/[?#]/)[0] ?? '';
        const pageChanged = previousPath !== null && path !== previousPath;
        previousPath = path;
        this.drawerOpen.set(false);
        if (pageChanged) {
          afterNextRender({ write: () => this.focusPage() }, { injector: this.injector });
        }
      });
  }

  protected toggleNav(): void {
    if (this.compact()) {
      this.drawerOpen.update((open) => !open);
    } else {
      this.railCollapsed.update((collapsed) => !collapsed);
    }
  }

  protected skipToMain(event: Event): void {
    event.preventDefault();
    this.focusPage();
  }

  /**
   * After a page change, start keyboard and screen reader users at the new page:
   * scroll to the top and focus its <h1> (or <main> when there is none).
   */
  private focusPage(): void {
    this.content().nativeElement.scrollTop = 0;
    const main = this.main().nativeElement;
    const heading = main.querySelector<HTMLElement>('h1[tabindex="-1"]');
    (heading ?? main).focus({ preventScroll: true });
  }

  private readCollapsed(): boolean {
    try {
      return this.storage?.getItem(NAV_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private storeCollapsed(collapsed: boolean): void {
    try {
      this.storage?.setItem(NAV_COLLAPSED_KEY, String(collapsed));
    } catch {
      // Storage unavailable: the choice lasts for this visit.
    }
  }
}
