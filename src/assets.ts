// Addresses for the playne models and pictures, with a fingerprint of the file's contents
// (see vite.config.ts): when a model changes, its address changes, so the offline cache
// fetches the new one instead of showing the old.

export function asset(path: string): string {
  const key = path.replace(/^\.\//, "");
  const v = typeof __ASSET_V__ === "object" ? __ASSET_V__[key] : undefined;
  return v ? `./${key}?v=${v}` : `./${key}`;
}
