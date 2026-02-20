export const isDev =
  process.env.NODE_ENV === "dev" ||
  process.env.NODE_ENV === "development" ||
  process.env.IS_DEV === "true";
