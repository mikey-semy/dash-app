import { copy } from "#common/copy.js";

export const durations = Object.freeze([
  [3600, "1", copy.hourUnit, copy.retention1Hour],
  [21600, "6", copy.hourUnit, copy.retention6Hours],
  [86400, "24", copy.hourUnit, copy.retention24Hours],
  [259200, "3", copy.dayUnit, copy.retention3Days],
  [604800, "7", copy.dayUnit, copy.retention7Days],
  [0, "∞", "", copy.forever],
  [-1, "1", "", copy.oneTime],
]);
