import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ValidationIssue } from '@provisioning/contracts';

/** Validation findings, errors in red and warnings in amber, each with an icon and its severity in words. */
@Component({
  selector: 'app-issue-list',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul [attr.aria-label]="label()">
      @for (issue of issues(); track $index) {
        <li [attr.data-severity]="issue.severity">
          <mat-icon [svgIcon]="issue.severity" aria-hidden="true" />
          <span
            ><span class="app-visually-hidden">{{ issue.severity }}: </span
            >{{ issue.message }}</span
          >
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      display: flex;
      flex-direction: column;
      gap: var(--app-space-1);
      margin: 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-medium);
    }
    li {
      display: flex;
      align-items: flex-start;
      gap: var(--app-space-2);
      color: var(--app-status-error-fg);
    }
    li[data-severity='warning'] {
      color: var(--app-status-warning-fg);
    }
    mat-icon {
      flex: none;
      width: 20px;
      height: 20px;
    }
  `,
})
export class IssueList {
  readonly issues = input.required<readonly ValidationIssue[]>();
  readonly label = input<string>();
}
