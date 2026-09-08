import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { Locale } from "date-fns";
import {
  enUS,
  es as esLocale,
  ptBR as ptLocale,
  fr as frLocale,
  de as deLocale,
  hi as hiLocale,
  id as idLocale,
  tr as trLocale,
  ar as arLocale,
  ru as ruLocale,
  zhCN as zhLocale,
  ja as jaLocale,
  ko as koLocale,
  it as itLocale,
  vi as viLocale,
} from "date-fns/locale";
import { en, type Dict, type DictKey } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { ptBR } from "./dictionaries/pt-BR";
import { fr } from "./dictionaries/fr";
import { de } from "./dictionaries/de";
import { hi } from "./dictionaries/hi";
import { id } from "./dictionaries/id";
import { tr } from "./dictionaries/tr";
import { ar } from "./dictionaries/ar";
import { ru } from "./dictionaries/ru";
import { zhCN } from "./dictionaries/zh-CN";
import { ja } from "./dictionaries/ja";
import { ko } from "./dictionaries/ko";
import { it } from "./dictionaries/it";
import { vi } from "./dictionaries/vi";

export const LANGUAGES = [
  "en",
  "es",
  "pt-BR",
  "hi",
  "id",
  "fr",
  "de",
  "tr",
  "ar",
  "ru",
  "zh-CN",
  "ja",
  "ko",
  "it",
  "vi",
] as const;
export type Language = (typeof LANGUAGES)[number];

/** Languages that render right-to-left. */
const RTL_LANGUAGES: readonly Language[] = ["ar"];

const DICTS: Record<Language, Dict> = {
  en,
  es,
  "pt-BR": ptBR,
  hi,
  id,
  fr,
  de,
  tr,
  ar,
  ru,
  "zh-CN": zhCN,
  ja,
  ko,
  it,
  vi,
};

const DATE_LOCALES: Record<Language, Locale> = {
  en: enUS,
  es: esLocale,
  "pt-BR": ptLocale,
  hi: hiLocale,
  id: idLocale,
  fr: frLocale,
  de: deLocale,
  tr: trLocale,
  ar: arLocale,
  ru: ruLocale,
  "zh-CN": zhLocale,
  ja: jaLocale,
  ko: koLocale,
  it: itLocale,
  vi: viLocale,
};

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: en["lang.name"],
  es: es["lang.name"],
  "pt-BR": ptBR["lang.name"],
  hi: hi["lang.name"],
  id: id["lang.name"],
  fr: fr["lang.name"],
  de: de["lang.name"],
  tr: tr["lang.name"],
  ar: ar["lang.name"],
  ru: ru["lang.name"],
  "zh-CN": zhCN["lang.name"],
  ja: ja["lang.name"],
  ko: ko["lang.name"],
  it: it["lang.name"],
  vi: vi["lang.name"],
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** Picks the closest supported language for a browser locale tag. */
export function resolveLanguage(tag: string | undefined | null): Language {
  if (!tag) return "en";
  if (isLanguage(tag)) return tag;
  const lower = tag.toLowerCase();
  if (lower.startsWith("pt")) return "pt-BR";
  const base = lower.split("-")[0];
  const match = LANGUAGES.find((lang) => lang.toLowerCase().split("-")[0] === base);
  return match ?? "en";
}

/**
 * Resolves the first supported language in the device/browser preference order.
 * This lets a user whose first locale is unsupported still receive their next
 * supported preference instead of falling straight back to English.
 */
export function resolvePreferredLanguage(
  tags: readonly (string | undefined | null)[] | undefined | null,
): Language {
  for (const tag of tags ?? []) {
    if (!tag) continue;
    const language = resolveLanguage(tag);
    if (language !== "en" || tag.toLowerCase().startsWith("en")) return language;
  }
  return "en";
}

export type TFunction = (key: DictKey, vars?: Record<string, string | number>) => string;

interface I18nValue {
  language: Language;
  t: TFunction;
  dateLocale: Locale;
}

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
      document.documentElement.dir = RTL_LANGUAGES.includes(language) ? "rtl" : "ltr";
    }
  }, [language]);

  const t = useCallback<TFunction>(
    (key, vars) => {
      const dict = DICTS[language] ?? en;
      return interpolate(dict[key] ?? en[key] ?? key, vars);
    },
    [language],
  );

  const value = useMemo<I18nValue>(
    () => ({ language, t, dateLocale: DATE_LOCALES[language] ?? enUS }),
    [language, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      language: "en",
      t: (key, vars) => interpolate(en[key] ?? key, vars),
      dateLocale: enUS,
    };
  }
  return context;
}

/** Localized "1 hr 30 min" style duration text. */
export function durationText(t: TFunction, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t("duration.min", { m });
  if (m === 0) return t("duration.hr", { h });
  return t("duration.hrMin", { h, m });
}

export type { DictKey };
