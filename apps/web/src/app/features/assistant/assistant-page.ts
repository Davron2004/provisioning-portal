import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-assistant-page',
  imports: [EmptyState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Assistant"
      subtitle="Describe a change in plain English and review the order before it is provisioned."
    />
    <app-empty-state
      icon="wand_stars"
      heading="The assistant is not available yet"
      message="Requests like “add three users at Kanata with voicemail” will turn into an order preview here."
    />
  `,
})
export class AssistantPage {}
