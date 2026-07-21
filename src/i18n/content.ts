import type { Lang } from './config';
import de from './de.json';
import en from './en.json';
import es from './es.json';

export interface Card {
  tag?: string;
  title: string;
  text: string;
}

export interface Meta {
  title: string;
  description: string;
}

export interface Dict {
  logo: string;
  brand: string;
  nav: {
    home: string;
    about: string;
    services: string;
    marketing: string;
    blog: string;
    contact: string;
  };
  getInTouch: string;
  langLabel: string;
  footer: { email: string; copyright: string };
  meta: {
    home: Meta;
    about: Meta;
    services: Meta;
    marketing: Meta;
    contact: Meta;
    blog: Meta;
  };
  home: {
    eyebrow: string;
    h1: string[];
    lead: string;
    secondaryBtn: string;
  };
  about: {
    eyebrow: string;
    h2: string;
    intro: string;
    cards: Card[];
  };
  services: {
    s1: { eyebrow: string; h2: string; intro: string; cards: Card[] };
    s2: { eyebrow: string; h2: string; intro: string; items: Card[] };
  };
  marketing: {
    eyebrow: string;
    h2: string;
    items: Card[];
  };
  contact: { h2: string; lead: string; cta: string };
  blog: { eyebrow: string; h2: string; empty: string; back: string };
}

// German (de.json) is the single source of truth, edited by hand or via the
// CMS. en.json / es.json are generated from it by scripts/translate.mjs
// (DeepL) with src/i18n/overrides/*.json merged on top — see README.
export const content: Record<Lang, Dict> = {
  de: de as Dict,
  en: en as Dict,
  es: es as Dict,
};
