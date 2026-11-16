import { copy } from "../../shared/copy.js";
import { LOCALE, TIME_ZONE } from "../../shared/config.js";

const number = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
export const bytes = (value) =>
  value < 1000
    ? Math.round(value) + copy.bytesSuffix
    : number.format(value / (value >= 1e9 ? 1e9 : value >= 1e6 ? 1e6 : 1e3)) +
      " " +
      (value >= 1e9
        ? copy.gigabytesUnit
        : value >= 1e6
          ? copy.megabytesUnit
          : copy.kilobytesUnit);
export const date = (value) =>
  new Date(value).toLocaleString(LOCALE, { timeZone: TIME_ZONE });
