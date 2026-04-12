// Thin wrapper using fetch() for dcnet_progress API endpoints
// NOTE: This is a www/ SPA page — the `frappe` JS global is NOT available.
// We use fetch() with the CSRF token injected by www/process.py.

import type {
  ProcessDefinition,
  ProcessRun,
  ProcessRunStep,
  MyTask,
  DashboardStats,
  ApiListResponse,
} from "./types";

declare global {
  interface Window {
    csrf_token?: string;
    boot?: Record<string, unknown>;
  }
}

async function call<T>(method: string, args?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/method/dcnet_progress.api.${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": window.csrf_token ?? "fetch",
    },
    credentials: "include",
    body: JSON.stringify(args ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.message as T;
}

// ----- Definition API -----

export async function getDefinitionList(opts?: {
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<ApiListResponse<ProcessDefinition>> {
  return call("definition.get_list", opts);
}

export async function getDefinition(name: string): Promise<ProcessDefinition> {
  return call("definition.get", { name });
}

export async function saveDefinition(
  definition: Partial<ProcessDefinition>
): Promise<ProcessDefinition> {
  return call("definition.save", { definition });
}

export async function publishDefinition(name: string): Promise<ProcessDefinition> {
  return call("definition.publish", { name });
}

// ----- Run API -----

export async function getMyTasks(opts?: {
  page?: number;
  page_size?: number;
}): Promise<ApiListResponse<MyTask>> {
  return call("run.get_my_tasks", opts);
}

export async function getRunList(opts?: {
  status?: string;
  definition?: string;
  page?: number;
  page_size?: number;
}): Promise<ApiListResponse<ProcessRun>> {
  return call("run.get_list", opts);
}

export interface RunDetail {
  run: ProcessRun;
  steps: ProcessRunStep[];
  activities: ProcessRunActivity[];
}

import type { ProcessRunActivity } from "./types";

export async function getRunDetail(name: string): Promise<RunDetail> {
  return call("run.get_detail", { name });
}

export async function startRun(opts: {
  definition: string;
  title?: string;
  context?: Record<string, unknown>;
}): Promise<ProcessRun> {
  return call("run.start", opts);
}

export async function executeStep(opts: {
  run: string;
  step: string;
  action: "Complete" | "Reject" | "Reassign" | "Comment";
  form_data?: Record<string, unknown>;
  comment?: string;
  reassign_to?: string;
}): Promise<{ ok: boolean }> {
  return call("run.execute_step", opts);
}

// ----- Dashboard API -----

export async function getDashboardStats(opts?: {
  days?: number;
}): Promise<DashboardStats> {
  return call("dashboard.get_stats", opts);
}
