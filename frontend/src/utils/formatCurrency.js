export const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD"];

export const CURRENCY_SYMBOLS = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
};

const LOCALE_MAP = {
  en: "en-US",
  hi: "hi-IN",
  gu: "gu-IN",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  ar: "ar-SA",
};

export function formatCurrency(amount, currency = "USD", language = "en") {
  const n = Number(amount || 0);
  const c = CURRENCY_SYMBOLS[currency] ? currency : "USD";
  const baseLanguage = language?.split("-")[0] || navigator.language?.split("-")[0] || "en";
  const locale = LOCALE_MAP[baseLanguage] || "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: c,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}
