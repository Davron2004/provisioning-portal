import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  console.error(error);
  showStartupError();
});

/** The app could not start (usually a missing or invalid /config.json). */
function showStartupError(): void {
  const message = document.createElement('div');
  message.setAttribute('role', 'alert');
  message.style.cssText =
    'max-width:32rem;margin:15vh auto;padding:0 1.5rem;font:16px/1.5 system-ui,sans-serif';
  const title = document.createElement('h1');
  title.textContent = 'The portal could not start';
  title.style.cssText = 'font-size:1.375rem;margin:0 0 .5rem';
  const detail = document.createElement('p');
  detail.textContent =
    'Its configuration could not be loaded. Reload the page; if this keeps happening, contact the team that runs the portal.';
  message.append(title, detail);
  document.body.replaceChildren(message);
}
