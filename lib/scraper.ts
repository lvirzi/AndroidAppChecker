export interface AppInfo {
  name: string;
  version: string;
  icon: string | null;
  developer: string | null;
  packageId: string;
}

export function extractPackageId(input: string): string | null {
  input = input.trim();
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.hostname.includes('play.google.com')) return url.searchParams.get('id');
  } catch {
    // not a url
  }
  return null;
}

export async function getAppInfo(packageId: string): Promise<AppInfo> {
  const { default: gplay } = await import('google-play-scraper');
  const info = await gplay.app({ appId: packageId, lang: 'en', country: 'us' });

  const version =
    info.version && info.version !== 'Varies with device' ? info.version : null;
  if (!version) throw new Error('VERSION_NOT_FOUND');

  return {
    name: info.title,
    version,
    icon: info.icon ?? null,
    developer: info.developer ?? null,
    packageId,
  };
}
