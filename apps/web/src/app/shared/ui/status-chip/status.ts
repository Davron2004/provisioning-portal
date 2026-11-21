import {
  AccountStatus,
  LineStatus,
  NumberStatus,
  OrderStatus,
  UserStatus,
} from '@provisioning/contracts';
import { AppIcon } from '../../../core/icons/icons';

/** Every status value in the contract. The same word means the same thing everywhere. */
export type AnyStatus = OrderStatus | LineStatus | UserStatus | NumberStatus | AccountStatus;

/** Semantic color families; see --app-status-* in styles/_tokens.scss. */
export type StatusTone = 'success' | 'info' | 'warning' | 'error' | 'neutral';

export interface StatusStyle {
  readonly label: string;
  readonly tone: StatusTone;
  readonly icon: AppIcon;
  /** Work is under way; the icon spins (unless reduced motion is on). */
  readonly busy: boolean;
}

const style = (label: string, tone: StatusTone, icon: AppIcon, busy = false): StatusStyle => ({
  label,
  tone,
  icon,
  busy,
});

export const STATUS_STYLES: Readonly<Record<AnyStatus, StatusStyle>> = {
  // Orders and order lines
  submitted: style('Submitted', 'neutral', 'schedule'),
  pending: style('Pending', 'neutral', 'schedule'),
  validating: style('Validating', 'info', 'progress_activity', true),
  provisioning: style('Provisioning', 'info', 'progress_activity', true),
  active: style('Active', 'success', 'check_circle'),
  succeeded: style('Succeeded', 'success', 'check_circle'),
  failed: style('Failed', 'error', 'error'),
  // Users
  removing: style('Removing', 'info', 'progress_activity', true),
  // Numbers
  available: style('Available', 'success', 'check_circle'),
  reserved: style('Reserved', 'warning', 'hourglass_empty'),
  assigned: style('Assigned', 'neutral', 'person'),
  // Accounts
  onboarding: style('Onboarding', 'info', 'hourglass_empty'),
  suspended: style('Suspended', 'warning', 'pause_circle'),
};

export function statusStyle(status: AnyStatus): StatusStyle {
  return STATUS_STYLES[status];
}
