import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import accountCircle from '@material-symbols/svg-400/outlined/account_circle.svg';
import add from '@material-symbols/svg-400/outlined/add.svg';
import apartment from '@material-symbols/svg-400/outlined/apartment.svg';
import arrowBack from '@material-symbols/svg-400/outlined/arrow_back.svg';
import arrowForward from '@material-symbols/svg-400/outlined/arrow_forward.svg';
import block from '@material-symbols/svg-400/outlined/block.svg';
import call from '@material-symbols/svg-400/outlined/call.svg';
import cancel from '@material-symbols/svg-400/outlined/cancel.svg';
import check from '@material-symbols/svg-400/outlined/check.svg';
import checkCircle from '@material-symbols/svg-400/outlined/check_circle.svg';
import chevronRight from '@material-symbols/svg-400/outlined/chevron_right.svg';
import close from '@material-symbols/svg-400/outlined/close.svg';
import cloudOff from '@material-symbols/svg-400/outlined/cloud_off.svg';
import contentCopy from '@material-symbols/svg-400/outlined/content_copy.svg';
import contrast from '@material-symbols/svg-400/outlined/contrast.svg';
import darkMode from '@material-symbols/svg-400/outlined/dark_mode.svg';
import dashboardFill from '@material-symbols/svg-400/outlined/dashboard-fill.svg';
import dashboard from '@material-symbols/svg-400/outlined/dashboard.svg';
import deleteIcon from '@material-symbols/svg-400/outlined/delete.svg';
import deskphone from '@material-symbols/svg-400/outlined/deskphone.svg';
import dialpad from '@material-symbols/svg-400/outlined/dialpad.svg';
import doNotDisturbOn from '@material-symbols/svg-400/outlined/do_not_disturb_on.svg';
import domainFill from '@material-symbols/svg-400/outlined/domain-fill.svg';
import domain from '@material-symbols/svg-400/outlined/domain.svg';
import edit from '@material-symbols/svg-400/outlined/edit.svg';
import error from '@material-symbols/svg-400/outlined/error.svg';
import exploreOff from '@material-symbols/svg-400/outlined/explore_off.svg';
import filterList from '@material-symbols/svg-400/outlined/filter_list.svg';
import formatQuote from '@material-symbols/svg-400/outlined/format_quote.svg';
import group from '@material-symbols/svg-400/outlined/group.svg';
import hourglassEmpty from '@material-symbols/svg-400/outlined/hourglass_empty.svg';
import inbox from '@material-symbols/svg-400/outlined/inbox.svg';
import info from '@material-symbols/svg-400/outlined/info.svg';
import keyboardReturn from '@material-symbols/svg-400/outlined/keyboard_return.svg';
import leftPanelClose from '@material-symbols/svg-400/outlined/left_panel_close.svg';
import leftPanelOpen from '@material-symbols/svg-400/outlined/left_panel_open.svg';
import lightMode from '@material-symbols/svg-400/outlined/light_mode.svg';
import locationOn from '@material-symbols/svg-400/outlined/location_on.svg';
import lock from '@material-symbols/svg-400/outlined/lock.svg';
import logout from '@material-symbols/svg-400/outlined/logout.svg';
import mail from '@material-symbols/svg-400/outlined/mail.svg';
import manageAccounts from '@material-symbols/svg-400/outlined/manage_accounts.svg';
import menu from '@material-symbols/svg-400/outlined/menu.svg';
import pauseCircle from '@material-symbols/svg-400/outlined/pause_circle.svg';
import person from '@material-symbols/svg-400/outlined/person.svg';
import personAdd from '@material-symbols/svg-400/outlined/person_add.svg';
import personOff from '@material-symbols/svg-400/outlined/person_off.svg';
import personRemove from '@material-symbols/svg-400/outlined/person_remove.svg';
import progressActivity from '@material-symbols/svg-400/outlined/progress_activity.svg';
import publicIcon from '@material-symbols/svg-400/outlined/public.svg';
import radioButtonUnchecked from '@material-symbols/svg-400/outlined/radio_button_unchecked.svg';
import receiptLongFill from '@material-symbols/svg-400/outlined/receipt_long-fill.svg';
import receiptLong from '@material-symbols/svg-400/outlined/receipt_long.svg';
import refresh from '@material-symbols/svg-400/outlined/refresh.svg';
import remove from '@material-symbols/svg-400/outlined/remove.svg';
import replay from '@material-symbols/svg-400/outlined/replay.svg';
import schedule from '@material-symbols/svg-400/outlined/schedule.svg';
import search from '@material-symbols/svg-400/outlined/search.svg';
import send from '@material-symbols/svg-400/outlined/send.svg';
import sync from '@material-symbols/svg-400/outlined/sync.svg';
import tag from '@material-symbols/svg-400/outlined/tag.svg';
import taskAlt from '@material-symbols/svg-400/outlined/task_alt.svg';
import visibility from '@material-symbols/svg-400/outlined/visibility.svg';
import visibilityOff from '@material-symbols/svg-400/outlined/visibility_off.svg';
import voicemail from '@material-symbols/svg-400/outlined/voicemail.svg';
import wandStarsFill from '@material-symbols/svg-400/outlined/wand_stars-fill.svg';
import wandStars from '@material-symbols/svg-400/outlined/wand_stars.svg';
import warning from '@material-symbols/svg-400/outlined/warning.svg';
import wifiOff from '@material-symbols/svg-400/outlined/wifi_off.svg';

/**
 * The app's icon set: Material Symbols (outlined, weight 400), bundled as inline SVG.
 * No icon font and no network request, so icons never flash in as ligature text.
 *
 * Use with `<mat-icon svgIcon="search" />`. To add an icon, import its SVG from
 * @material-symbols/svg-400/outlined and list it here; `-fill` variants are the filled style.
 */
export const APP_ICONS = {
  account_circle: accountCircle,
  add: add,
  apartment: apartment,
  arrow_back: arrowBack,
  arrow_forward: arrowForward,
  block: block,
  call: call,
  cancel: cancel,
  check: check,
  check_circle: checkCircle,
  chevron_right: chevronRight,
  close: close,
  cloud_off: cloudOff,
  content_copy: contentCopy,
  contrast: contrast,
  dark_mode: darkMode,
  dashboard: dashboard,
  'dashboard-fill': dashboardFill,
  delete: deleteIcon,
  deskphone: deskphone,
  dialpad: dialpad,
  do_not_disturb_on: doNotDisturbOn,
  domain: domain,
  'domain-fill': domainFill,
  edit: edit,
  error: error,
  explore_off: exploreOff,
  filter_list: filterList,
  format_quote: formatQuote,
  group: group,
  hourglass_empty: hourglassEmpty,
  inbox: inbox,
  info: info,
  keyboard_return: keyboardReturn,
  left_panel_close: leftPanelClose,
  left_panel_open: leftPanelOpen,
  light_mode: lightMode,
  location_on: locationOn,
  lock: lock,
  logout: logout,
  mail: mail,
  manage_accounts: manageAccounts,
  menu: menu,
  pause_circle: pauseCircle,
  person: person,
  person_add: personAdd,
  person_off: personOff,
  person_remove: personRemove,
  progress_activity: progressActivity,
  public: publicIcon,
  radio_button_unchecked: radioButtonUnchecked,
  receipt_long: receiptLong,
  'receipt_long-fill': receiptLongFill,
  refresh: refresh,
  remove: remove,
  replay: replay,
  schedule: schedule,
  search: search,
  send: send,
  sync: sync,
  tag: tag,
  task_alt: taskAlt,
  visibility: visibility,
  visibility_off: visibilityOff,
  voicemail: voicemail,
  wand_stars: wandStars,
  'wand_stars-fill': wandStarsFill,
  warning: warning,
  wifi_off: wifiOff,
} as const satisfies Record<string, string>;

export type AppIcon = keyof typeof APP_ICONS;

export function provideAppIcons(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const registry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    for (const [name, svg] of Object.entries(APP_ICONS)) {
      // Trusted: static SVG files bundled at build time, never user input.
      registry.addSvgIconLiteral(name, sanitizer.bypassSecurityTrustHtml(svg));
    }
  });
}
