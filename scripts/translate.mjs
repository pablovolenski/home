#!/usr/bin/env node
/**
 * DE → EN/ES translation pipeline (DeepL).
 *
 * German is the single source of truth:
 *   - src/content/blog/de/*.md   → src/content/blog/{en,es}/<same-name>.md
 *   - src/i18n/de.json           → src/i18n/{en,es}.json (+ overrides merged on top)
 *
 * Markdown is translated structurally: the file is parsed to an AST and only
 * plain text nodes are sent to DeepL. Code blocks, inline code, URLs and all
 * Markdown structure pass through untouched. Frontmatter: title/description
 * are translated; pubDate/draft copied; lang rewritten.
 *
 * Usage:
 *   node scripts/translate.mjs --all                 # everything
 *   node scripts/translate.mjs --files a.md b.md ... # specific German sources
 *                                                    # (deleted files remove their translations)
 *   Flags: --dry-run  (list what would happen, no API calls, no writes)
 *
 * Env:
 *   DEEPL_API_KEY   required unless --dry-run or TRANSLATE_STUB=1
 *   TRANSLATE_STUB  =1 → no API; wraps text as «xx:...» (for testing structure)
 */

import { readFile, writeFile, readdir, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import { visit } from 'unist-util-visit';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BLOG_DE = path.join(ROOT, 'src/content/blog/de');
const BLOG_DIR = (lang) => path.join(ROOT, 'src/content/blog', lang);
const I18N = path.join(ROOT, 'src/i18n');

// DeepL free endpoint; switch host to api.deepl.com for a paid key.
const DEEPL_URL = 'https://api-free.deepl.com/v2/translate';
const TARGETS = {
  en: { deepl: 'EN-US', formality: null },
  es: { deepl: 'ES', formality: 'prefer_less' }, // keep the informal "tú" register
};

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const STUB = process.env.TRANSLATE_STUB === '1';
const ALL = args.includes('--all');
const fileArgs = (() => {
  const i = args.indexOf('--files');
  return i === -1 ? [] : args.slice(i + 1).filter((a) => !a.startsWith('--'));
})();

const API_KEY = process.env.DEEPL_API_KEY;
if (!DRY && !STUB && !API_KEY) {
  console.error('DEEPL_API_KEY is not set (or use --dry-run / TRANSLATE_STUB=1).');
  process.exit(1);
}

/** Translate an array of strings in one or more DeepL batch calls. */
async function translateBatch(texts, targetLang) {
  if (texts.length === 0) return [];
  if (STUB) return texts.map((t) => `«${targetLang}:${t}»`);
  const { deepl, formality } = TARGETS[targetLang];
  const out = [];
  for (let i = 0; i < texts.length; i += 50) {
    const chunk = texts.slice(i, i + 50);
    const body = new URLSearchParams();
    for (const t of chunk) body.append('text', t);
    body.set('source_lang', 'DE');
    body.set('target_lang', deepl);
    body.set('preserve_formatting', '1');
    if (formality) body.set('formality', formality);
    const res = await fetch(DEEPL_URL, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${API_KEY}` },
      body,
    });
    if (!res.ok) {
      throw new Error(`DeepL ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    out.push(...data.translations.map((t) => t.text));
  }
  return out;
}

/* ---------------- Markdown ---------------- */

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkStringify, {
    bullet: '-',
    emphasis: '_',
    strong: '*',
    fences: true,
    rule: '-',
  });

/** Collect translatable text nodes from the tree (skips code/inlineCode/yaml). */
function collectTextNodes(tree) {
  const nodes = [];
  visit(tree, 'text', (node, _idx, parent) => {
    // Text nodes never appear inside code/inlineCode (those hold their value
    // directly), so everything here is prose — including link/emphasis text.
    if (parent && parent.type === 'link' && node === parent.children?.[0] && node.value === parent.url) {
      return; // autolink-style <https://…> — leave alone
    }
    nodes.push(node);
  });
  return nodes;
}

async function translateMarkdownFile(deFile, targetLang) {
  const raw = await readFile(deFile, 'utf8');
  const tree = processor.parse(raw);

  // Frontmatter
  const fmNode = tree.children.find((n) => n.type === 'yaml');
  const fm = fmNode ? YAML.parse(fmNode.value) : {};

  const textNodes = collectTextNodes(tree);
  const fmTexts = [];
  if (fm.title) fmTexts.push(fm.title);
  if (fm.description) fmTexts.push(fm.description);

  if (DRY) {
    console.log(`[dry-run] ${path.basename(deFile)} → ${targetLang}: ` +
      `${fmTexts.length} frontmatter strings, ${textNodes.length} text nodes`);
    return null;
  }

  const translated = await translateBatch(
    [...fmTexts, ...textNodes.map((n) => n.value)],
    targetLang,
  );

  let cursor = 0;
  if (fm.title) fm.title = translated[cursor++];
  if (fm.description) fm.description = translated[cursor++];
  fm.lang = targetLang;
  textNodes.forEach((n) => { n.value = translated[cursor++]; });

  if (fmNode) fmNode.value = YAML.stringify(fm).trimEnd();

  return processor.stringify(tree);
}

/* ---------------- JSON dictionary ---------------- */

const SKIP_JSON_KEYS = new Set(['_generated', '_comment', 'email', 'copyright']);

/** Depth-first walk collecting [container, key] slots holding translatable strings. */
function collectJsonSlots(obj, slots = []) {
  for (const [key, val] of Object.entries(obj)) {
    if (SKIP_JSON_KEYS.has(key)) continue;
    if (typeof val === 'string') slots.push([obj, key]);
    else if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (typeof item === 'string') slots.push([val, i]);
        else if (item && typeof item === 'object') collectJsonSlots(item, slots);
      });
    } else if (val && typeof val === 'object') collectJsonSlots(val, slots);
  }
  return slots;
}

function deepMerge(base, override) {
  for (const [key, val] of Object.entries(override)) {
    if (key === '_comment') continue;
    if (val && typeof val === 'object' && !Array.isArray(val) && base[key] && typeof base[key] === 'object') {
      deepMerge(base[key], val);
    } else {
      base[key] = val;
    }
  }
  return base;
}

async function translateDictionary(targetLang) {
  const de = JSON.parse(await readFile(path.join(I18N, 'de.json'), 'utf8'));
  const slots = collectJsonSlots(de);

  if (DRY) {
    console.log(`[dry-run] de.json → ${targetLang}.json: ${slots.length} strings`);
    return;
  }

  const translated = await translateBatch(slots.map(([c, k]) => c[k]), targetLang);
  slots.forEach(([c, k], i) => { c[k] = translated[i]; });

  const overridePath = path.join(I18N, 'overrides', `${targetLang}.json`);
  try {
    await access(overridePath);
    deepMerge(de, JSON.parse(await readFile(overridePath, 'utf8')));
  } catch { /* no overrides file — fine */ }

  const out = {
    _generated: `AUTO-GENERATED from src/i18n/de.json by scripts/translate.mjs — do not edit by hand. Manual fixes go in src/i18n/overrides/${targetLang}.json.`,
    ...de,
  };
  await writeFile(path.join(I18N, `${targetLang}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote src/i18n/${targetLang}.json`);
}

/* ---------------- main ---------------- */

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  // Determine which German blog files to process.
  let deFiles = [];
  let dictChanged = ALL;

  if (ALL) {
    deFiles = (await readdir(BLOG_DE)).filter((f) => f.endsWith('.md')).map((f) => path.join(BLOG_DE, f));
  } else {
    for (const f of fileArgs) {
      const abs = path.resolve(ROOT, f);
      if (abs === path.join(I18N, 'de.json')) dictChanged = true;
      else if (abs.startsWith(BLOG_DE)) deFiles.push(abs);
      else console.warn(`ignoring non-source file: ${f}`);
    }
  }

  if (deFiles.length === 0 && !dictChanged) {
    console.log('Nothing to translate.');
    return;
  }

  for (const deFile of deFiles) {
    const name = path.basename(deFile);
    if (!(await exists(deFile))) {
      // German source deleted → remove translations.
      for (const lang of Object.keys(TARGETS)) {
        const target = path.join(BLOG_DIR(lang), name);
        if (await exists(target)) {
          if (DRY) console.log(`[dry-run] would delete ${target}`);
          else { await unlink(target); console.log(`deleted src/content/blog/${lang}/${name}`); }
        }
      }
      continue;
    }
    for (const lang of Object.keys(TARGETS)) {
      const result = await translateMarkdownFile(deFile, lang);
      if (result !== null) {
        await writeFile(path.join(BLOG_DIR(lang), name), result);
        console.log(`wrote src/content/blog/${lang}/${name}`);
      }
    }
  }

  if (dictChanged) {
    for (const lang of Object.keys(TARGETS)) {
      await translateDictionary(lang);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
