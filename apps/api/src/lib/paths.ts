import path from "node:path";

export function uploadsDir(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\api") || cwd.endsWith("apps/api")) {
    return path.resolve(cwd, "../../uploads");
  }
  return path.resolve(cwd, "uploads");
}

export function repoRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\api") || cwd.endsWith("apps/api")) {
    return path.resolve(cwd, "../..");
  }
  return path.resolve(cwd);
}
