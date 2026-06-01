import path from "node:path";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

export interface TaskState {
  id: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  plan: Array<{
    description: string;
    status: "pending" | "running" | "completed" | "failed";
  }>;
  currentStep: number;
  editedFiles: string[];
  createdAt: string;
  updatedAt: string;
}

export class TaskManager {
  private plansDir: string;

  constructor(workspaceRoot: string) {
    this.plansDir = path.join(workspaceRoot, ".crayon", "tasks");
  }

  async init(): Promise<void> {
    await mkdir(this.plansDir, { recursive: true });
  }

  async createTask(id: string, description: string, planSteps: string[]): Promise<TaskState> {
    await this.init();
    const state: TaskState = {
      id,
      description,
      status: "pending",
      plan: planSteps.map(step => ({ description: step, status: "pending" })),
      currentStep: 0,
      editedFiles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.saveTask(state);
    return state;
  }

  async getTask(id: string): Promise<TaskState | null> {
    const taskPath = path.join(this.plansDir, `${id}.json`);
    if (!existsSync(taskPath)) return null;
    const content = await readFile(taskPath, "utf-8");
    return JSON.parse(content) as TaskState;
  }

  async saveTask(state: TaskState): Promise<void> {
    await this.init();
    state.updatedAt = new Date().toISOString();
    const taskPath = path.join(this.plansDir, `${state.id}.json`);
    await writeFile(taskPath, JSON.stringify(state, null, 2), "utf-8");
  }

  async listTasks(): Promise<TaskState[]> {
    await this.init();
    const files = await readdir(this.plansDir);
    const tasks: TaskState[] = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const id = file.replace(".json", "");
        const task = await this.getTask(id);
        if (task) tasks.push(task);
      }
    }
    return tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}
