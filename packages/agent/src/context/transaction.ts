import { mkdir, copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export interface Snapshot {
  taskId: string;
  files: Record<string, {
    exists: boolean;
    backupPath: string;
  }>;
  createdAt: number;
}

export class TransactionManager {
  private backupDir: string;
  private currentSnapshot: Snapshot | null = null;

  constructor(private workspaceRoot: string) {
    this.backupDir = path.join(workspaceRoot, ".crayon", "backups");
  }

  private async init() {
    await mkdir(this.backupDir, { recursive: true });
  }

  async beginTransaction(taskId: string): Promise<void> {
    await this.init();
    this.currentSnapshot = {
      taskId,
      files: {},
      createdAt: Date.now()
    };
  }

  async snapshotFile(filePath: string): Promise<void> {
    if (!this.currentSnapshot) return;

    // Resolve relative to workspace root if necessary, or assume it's relative
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath);
    const relPath = path.isAbsolute(filePath) ? path.relative(this.workspaceRoot, filePath) : filePath;
    
    // Don't snapshot multiple times in same transaction
    if (this.currentSnapshot.files[relPath]) return;

    const backupFileName = `${this.currentSnapshot.taskId}_${relPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const backupPath = path.join(this.backupDir, backupFileName);

    if (existsSync(absPath)) {
      await copyFile(absPath, backupPath);
      this.currentSnapshot.files[relPath] = {
        exists: true,
        backupPath
      };
    } else {
      this.currentSnapshot.files[relPath] = {
        exists: false,
        backupPath
      };
    }
  }

  async commitTransaction(): Promise<void> {
    if (!this.currentSnapshot) return;
    
    // Cleanup backups for this task
    for (const [_, info] of Object.entries(this.currentSnapshot.files)) {
      if (info.exists && existsSync(info.backupPath)) {
        try {
          await rm(info.backupPath);
        } catch {}
      }
    }
    this.currentSnapshot = null;
  }

  async rollbackTransaction(): Promise<string[]> {
    if (!this.currentSnapshot) return [];

    const restoredFiles: string[] = [];
    for (const [relPath, info] of Object.entries(this.currentSnapshot.files)) {
      const absPath = path.join(this.workspaceRoot, relPath);
      if (info.exists) {
        if (existsSync(info.backupPath)) {
          await copyFile(info.backupPath, absPath);
          await rm(info.backupPath).catch(() => {});
          restoredFiles.push(relPath);
        }
      } else {
        // File didn't exist before, so delete it
        if (existsSync(absPath)) {
          await rm(absPath).catch(() => {});
          restoredFiles.push(relPath);
        }
      }
    }
    
    this.currentSnapshot = null;
    return restoredFiles;
  }

  hasActiveTransaction(): boolean {
    return this.currentSnapshot !== null;
  }
}
