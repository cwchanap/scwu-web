import version from './generated/assets-version.json';

// Where the exported art and audio are served from. The Cloudflare build sets
// VITE_ASSET_BASE to the public R2 bucket's URL, which serves each export under
// its version (assets-version.json, in generated.tar.gz). The version makes
// every object immutable, so a new export is a new prefix. Everywhere else they
// come from this site's own /assets/, with no version.
const remote: string | undefined = import.meta.env.VITE_ASSET_BASE;

export const ASSET_BASE = remote
  ? `${remote.replace(/\/*$/, '/')}${version.version}/`
  : `${import.meta.env.BASE_URL}assets/`;
