import type { Page } from '@playwright/test';

export const USER = {
  name: 'Ryuko',
  avatarUrl: null,
  createdAt: '2026-11-06T05:53:34Z',
};

export const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

// The specs never contact the network: anything off the loopback origin
// aborts, so a missed stub fails the test instead of leaking a request.
export const offlineGuard = (page: Page) =>
  page.route('**/*', (route) => {
    const { hostname } = new URL(route.request().url());
    return hostname === '127.0.0.1' || hostname === 'localhost'
      ? route.continue()
      : route.abort();
  });

// A local stand-in for the GIS client: initialize() stores the page's
// credential callback, and renderButton() mounts a plain button whose click
// delivers a fake ID token through it, exactly like the real widget.
const GIS_STUB = `window.google = {
  accounts: {
    id: {
      initialize(config) {
        window.__gisCallback = config.callback;
      },
      renderButton(el) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Sign in with Google';
        button.addEventListener('click', () =>
          window.__gisCallback({ credential: 'stub-id-token' }),
        );
        el.replaceChildren(button);
      },
    },
  },
};`;

export const stubGis = (page: Page) =>
  page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: GIS_STUB }),
  );
