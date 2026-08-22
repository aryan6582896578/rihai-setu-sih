import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { uploadsDir } from "./paths.js";

export interface StoredFile {
  key: string;
  url: string;
}

export interface StorageAdapter {
  save(key: string, contents: string | Buffer): Promise<StoredFile>;
}

class LocalDiskStorage implements StorageAdapter {
  async save(key: string, contents: string | Buffer): Promise<StoredFile> {
    const target = path.join(uploadsDir(), key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    return { key, url: `/uploads/${key.split("\\").join("/")}` };
  }
}

export const storage: StorageAdapter = new LocalDiskStorage();

export function randomKey(prefix: string, ext: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
}
