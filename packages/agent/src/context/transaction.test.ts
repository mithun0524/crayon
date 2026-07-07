import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TransactionManager } from "./transaction.js";

describe("TransactionManager", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "crayon-tx-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("restores an edited file's original content on rollback", async () => {
    const rel = "a.txt";
    await writeFile(path.join(root, rel), "original", "utf-8");

    const tx = new TransactionManager(root);
    await tx.beginTransaction("t1");
    await tx.snapshotFile(rel);

    // Simulate an edit
    await writeFile(path.join(root, rel), "modified", "utf-8");
    expect(await readFile(path.join(root, rel), "utf-8")).toBe("modified");

    const restored = await tx.rollbackTransaction();
    expect(restored).toContain(rel);
    expect(await readFile(path.join(root, rel), "utf-8")).toBe("original");
  });

  it("deletes a newly-created file on rollback", async () => {
    const rel = "new.txt";
    const tx = new TransactionManager(root);
    await tx.beginTransaction("t2");

    // Snapshot BEFORE creating — records that the file did not exist
    await tx.snapshotFile(rel);
    await writeFile(path.join(root, rel), "created", "utf-8");
    expect(existsSync(path.join(root, rel))).toBe(true);

    const restored = await tx.rollbackTransaction();
    expect(restored).toContain(rel);
    expect(existsSync(path.join(root, rel))).toBe(false);
  });

  it("keeps changes and removes backups on commit", async () => {
    const rel = "b.txt";
    await writeFile(path.join(root, rel), "v1", "utf-8");

    const tx = new TransactionManager(root);
    await tx.beginTransaction("t3");
    await tx.snapshotFile(rel);
    await writeFile(path.join(root, rel), "v2", "utf-8");

    await tx.commitTransaction();

    expect(await readFile(path.join(root, rel), "utf-8")).toBe("v2");
    expect(tx.hasActiveTransaction()).toBe(false);
    // Backup for the file should be cleaned up
    const backupDir = path.join(root, ".crayon", "backups");
    if (existsSync(backupDir)) {
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(backupDir);
      expect(files.length).toBe(0);
    }
  });

  it("snapshots each file only once per transaction", async () => {
    const rel = "c.txt";
    await writeFile(path.join(root, rel), "start", "utf-8");

    const tx = new TransactionManager(root);
    await tx.beginTransaction("t4");
    await tx.snapshotFile(rel); // captures "start"
    await writeFile(path.join(root, rel), "middle", "utf-8");
    await tx.snapshotFile(rel); // must NOT overwrite the backup with "middle"
    await writeFile(path.join(root, rel), "end", "utf-8");

    await tx.rollbackTransaction();
    expect(await readFile(path.join(root, rel), "utf-8")).toBe("start");
  });
});
