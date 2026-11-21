import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const PRODUCT_NAME = 'Provisioning Portal';

/**
 * The document title: the route's `title`, then what the page is about (when it says),
 * then the product name. "Users · Lumen Ridge Robotics · Provisioning Portal".
 *
 * A page that shows a named thing calls `setSubject(name)` once it has loaded, and
 * `setSubject(null)` when it goes away.
 */
@Injectable({ providedIn: 'root' })
export class DocumentTitle {
  private readonly title = inject(Title);
  private routeTitle: string | null = null;
  private subject: string | null = null;

  setRouteTitle(title: string | null): void {
    this.routeTitle = title;
    this.apply();
  }

  setSubject(subject: string | null): void {
    this.subject = subject;
    this.apply();
  }

  private apply(): void {
    const parts = [this.routeTitle, this.subject, PRODUCT_NAME].filter(
      (part, index, all): part is string => !!part && all.indexOf(part) === index,
    );
    this.title.setTitle(parts.join(' · '));
  }
}

/** Feeds each route's `title` to DocumentTitle. */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly documentTitle = inject(DocumentTitle);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.documentTitle.setRouteTitle(this.buildTitle(snapshot) ?? null);
  }
}
