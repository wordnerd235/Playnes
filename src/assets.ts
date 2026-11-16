// Addresses for the playne models and pictures, with a fingerprint of the file's contents in
// the name (see vite.config.ts): when a model changes, its address changes, so no cache
// (the iPad's, the offline one, or GitHub's) can keep showing the old one.

export function asset(path: string): string {
  const key = path.replace(/^\.\//, "");
  const v = typeof __ASSET_V__ === "object" ? __ASSET_V__[key] : undefined;
  if (!v) return `./${key}`;
  // The fingerprint goes in the file name ("models/c172.0cee1f9d.glb"), not after a "?": GitHub
  // Pages' cache ignores "?v=..." and could hand out the old model for minutes after a deploy.
  // The build writes a copy of each file under that name (vite.config.ts); the dev server
  // only has the plain files, so it keeps the "?v=" form.
  if (import.meta.env.DEV) return `./${key}?v=${v}`;
  return `./${key.replace(/(\.[a-z0-9]+)$/i, `.${v}$1`)}`;
}
