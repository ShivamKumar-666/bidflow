import { format, formatDistanceToNow } from "date-fns";
import { enUS, hi, gu, es, fr, de, ar } from "date-fns/locale";
import i18n from "@/i18n";

const DATE_LOCALES = { en: enUS, hi, gu, es, fr, de, ar };

function getLocale() {
  return DATE_LOCALES[i18n.language?.slice(0, 2)] || enUS;
}

export function formatDate(date, formatStr) {
  return format(date, formatStr, { locale: getLocale() });
}

export function timeAgo(date) {
  return formatDistanceToNow(date, { addSuffix: true, locale: getLocale() });
}
