import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-not-found-page',
  imports: [EmptyState, MatButtonModule, PageHeader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Page not found" />
    <app-empty-state
      icon="explore_off"
      heading="There is nothing at this address"
      message="The link may be mistyped, or the page may have moved."
    >
      <a matButton="filled" routerLink="/overview">Go to overview</a>
    </app-empty-state>
  `,
})
export class NotFoundPage {}
