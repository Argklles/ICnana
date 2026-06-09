// src/config/types.ts

export interface TestCase {
  input: string;
  output: string;
  actual: string;
  status: "pending" | "running" | "ac" | "wa" | "error";
}

export interface QuestionMeta {
  name: string;
  group: string;
  url: string;
  timeLimit: number;
  memoryLimit: number;
}

export interface Favorite {
  name: string;
  url: string;
}

export interface HistoryEntry {
  url: string;
  timestamp: number;
}

export type TabType = "code" | "browser";