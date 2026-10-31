// Where the exported art and audio are served from. The Cloudflare build sets
// VITE_ASSET_BASE to the public R2 bucket's URL; everywhere else they come from
// this site's own /assets/.
const remote: string | undefined = import.meta.env.VITE_ASSET_BASE;

export const ASSET_BASE = remote
  ? remote.replace(/\/?$/, '/')
  : `${import.meta.env.BASE_URL}assets/`;
