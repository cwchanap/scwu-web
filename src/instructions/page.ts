import { ASSET_BASE } from '../game/assetBase';

// CSS url()s cannot read ASSET_BASE, so the stylesheet takes them as properties.
export const installBackdrop = () => {
  document.documentElement.style.setProperty(
    '--select-bg',
    `url(${ASSET_BASE}select/15.png)`,
  );
};

// The guide opens in a new tab, so Back closes it when the browser allows;
// a tab it can't close (typed-in, or history grown past hash picks) goes to
// the game itself.
export const back = (event: MouseEvent) => {
  event.preventDefault();
  window.close();
  setTimeout(() => {
    location.href = import.meta.env.BASE_URL;
  }, 150);
};
