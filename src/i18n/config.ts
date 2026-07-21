export const locales = ['de', 'en', 'es'] as const;
export type Lang = (typeof locales)[number];

export const defaultLang: Lang = 'de';
export const prefixedLangs = locales.filter((l) => l !== defaultLang);

export const languageNames: Record<Lang, string> = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
};

export const languageShort: Record<Lang, string> = {
  de: 'DE',
  en: 'EN',
  es: 'ES',
};

export const dateLocale: Record<Lang, string> = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
};

/**
 * Build a locale-aware path. The default language (German) lives at the
 * root with no prefix; every other language is served under /<lang>/.
 *   localizedPath('de', 'about')        -> '/about'
 *   localizedPath('en', 'about')        -> '/en/about'
 *   localizedPath('es', 'blog/welcome') -> '/es/blog/welcome'
 *   localizedPath('en', '')             -> '/en/'
 */
export function localizedPath(lang: Lang, path = ''): string {
  const clean = String(path).replace(/^\/+|\/+$/g, '');
  const prefix = lang === defaultLang ? '' : `/${lang}`;
  if (!clean) return prefix ? `${prefix}/` : '/';
  return `${prefix}/${clean}`;
}

export function formatDate(date: Date, lang: Lang): string {
  return date.toLocaleDateString(dateLocale[lang], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
