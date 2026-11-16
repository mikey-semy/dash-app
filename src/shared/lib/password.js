import { PIN_DIGITS } from "../../../shared/config.js";

export function generatePin() {
  const bytes = new Uint32Array(1),
    limit = 10 ** PIN_DIGITS;
  const ceiling = Math.floor(2 ** 32 / limit) * limit;
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= ceiling);
  return String(bytes[0] % limit).padStart(PIN_DIGITS, "0");
}
