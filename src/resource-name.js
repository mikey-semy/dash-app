export const resourceName = (name) =>
  name.replace(/\.(?:Без (?:названия|имени)|download)$/iu, "");
