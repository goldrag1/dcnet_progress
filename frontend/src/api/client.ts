// Thin wrapper using fetch() for dcnet_progress API endpoints
// NOTE: This is a www/ SPA page — the `frappe` JS global is NOT available.
// We use fetch() with the CSRF token injected by www/process.py.

import type {
  ProcessDefinition,
  ProcessRun,
  ProcessRunStep,
  ProcessRunActivity,
  ProcessRunComment,
  ProcessFavorite,
  ProcessSavedFilter,
  MyTask,
  DashboardStats,
  DashboardOverview,
  ProcessTemplate,
  ProcessVersion,
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

export async function getTemplates(): Promise<ProcessTemplate[]> {
  return call("definition.get_templates");
}

export async function createFromTemplate(opts: {
  template_name: string;
  title: string;
}): Promise<ProcessDefinition> {
  return call("definition.create_from_template", opts);
}

export async function getVersions(definition: string): Promise<ProcessVersion[]> {
  return call("definition.get_versions", { definition });
}

export async function restoreVersion(opts: {
  definition: string;
  version: string;
}): Promise<ProcessDefinition> {
  return call("definition.restore_version", opts);
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
  initiator?: string;
  is_draft?: number;
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

export async function getRunDetail(name: string): Promise<RunDetail> {
  return call("run.get_detail", { run: name });
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
  action: "Complete" | "Reject" | "Reassign" | "Comment" | "Forward" | "Return";
  form_data?: Record<string, unknown>;
  comment?: string;
  reassign_to?: string;
  forward_to?: string;
  return_to_step?: string;
}): Promise<{ ok: boolean }> {
  return call("run.execute_step", opts);
}

export async function withdrawRun(run: string): Promise<{ ok: boolean }> {
  return call("run.withdraw", { run });
}

// ----- Draft API -----

export async function saveDraft(opts: {
  definition: string;
  title?: string;
  context?: Record<string, unknown>;
}): Promise<ProcessRun> {
  return call("run.save_draft", opts);
}

export async function submitDraft(run: string): Promise<ProcessRun> {
  return call("run.submit_draft", { run });
}

export async function duplicateRun(run: string): Promise<ProcessRun> {
  return call("run.duplicate", { run });
}

export async function cancelRun(run: string): Promise<{ ok: boolean }> {
  return call("run.cancel", { run });
}

// ----- Comment API -----

export async function addComment(opts: {
  run: string;
  content: string;
  mentions?: string[];
}): Promise<ProcessRunComment> {
  return call("run.add_comment", opts);
}

export async function getComments(run: string): Promise<ProcessRunComment[]> {
  return call("run.get_comments", { run });
}

// ----- Favorite API -----

export async function toggleFavorite(definition: string): Promise<{ is_favorite: boolean }> {
  return call("run.toggle_favorite", { definition });
}

export async function getMyFavorites(): Promise<ProcessFavorite[]> {
  return call("run.get_my_favorites");
}

// ----- Saved Filter API -----

export async function saveFilter(opts: {
  filter_name: string;
  filters_json: string;
  share_scope: "Private" | "Department" | "All";
  definition?: string;
}): Promise<ProcessSavedFilter> {
  return call("run.save_filter", opts);
}

export async function getSavedFilters(definition?: string): Promise<ProcessSavedFilter[]> {
  return call("run.get_filters", { definition });
}

export async function deleteSavedFilter(name: string): Promise<{ ok: boolean }> {
  return call("run.delete_filter", { name });
}

// ----- Dashboard API -----

export async function getDashboardStats(opts?: {
  days?: number;
}): Promise<DashboardStats> {
  return call("dashboard.get_stats", opts);
}

export async function getDashboardOverview(opts?: {
  days?: number;
  definition?: string;
}): Promise<DashboardOverview> {
  return call("dashboard.get_overview", opts as Record<string, unknown>);
}

export function exportDashboard(_opts?: { days?: number }): void {
  window.open(
    "/api/method/dcnet_progress.api.dashboard.export_excel",
    "_blank"
  );
}
