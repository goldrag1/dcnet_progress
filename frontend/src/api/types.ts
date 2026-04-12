// TypeScript interfaces matching actual DocType fields in dcnet_progress

export interface FormField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea" | "checkbox" | "link";
  required?: boolean;
  options?: string[];
  link_doctype?: string;
}

export interface ProcessStep {
  step_id: string;
  step_type: "Start" | "Task" | "Approval" | "Fork" | "Join" | "End";
  label: string;
  assigned_role?: string;
  assigned_user?: string;
  assigned_department?: string;
  form_schema?: string;
  is_parallel?: 0 | 1;
  parallel_group?: string;
  auto_complete?: 0 | 1;
  sla_hours?: number;
  step_order?: number;
  approval_mode?: "Any" | "All" | "Majority";
  deadline_type?: "None" | "Fixed Duration" | "From Field";
  deadline_hours?: number;
  deadline_field?: string;
  email_enabled?: 0 | 1;
  email_template?: string;
  no_return?: 0 | 1;
  display_fields?: string;
  parallel_group_label?: string;
}

export interface ProcessTransition {
  from_step: string;
  to_step: string;
  condition?: string;
  label?: string;
  action_trigger?: "Send" | "Approve" | "Reject" | "Forward" | "Return";
  target_mode?: "Auto" | "Manual";
  target_step_id?: string;
  trigger?: string;
}

export interface ProcessDefinition {
  name: string;
  title: string;
  description?: string;
  status: "Draft" | "Published" | "Suspended";
  version: number;
  steps_json?: string;
  transitions_json?: string;
  owner?: string;
  creation?: string;
  modified?: string;
  icon?: string;
  run_permission_type?: "Everyone" | "Role" | "User" | "Department";
  run_permission_value?: string;
  auto_title_template?: string;
  version_label?: string;
}

export interface ProcessRun {
  name: string;
  definition: string;
  definition_title: string;
  title: string;
  status: "Running" | "Completed" | "Cancelled" | "Rejected" | "Draft";
  initiator: string;
  started_at?: string;
  completed_at?: string;
  run_data?: string;
  context_json?: string;
  is_draft?: 0 | 1;
}

export interface ProcessRunStep {
  name: string;
  run: string;
  step_id: string;
  step_type: string;
  label: string;
  status: "Pending" | "Active" | "Completed" | "Rejected" | "Skipped";
  assigned_to?: string;
  started_at?: string;
  completed_at?: string;
  completed_by?: string;
  form_schema?: FormField[];
  form_data?: Record<string, unknown> | null;
  deadline_at?: string;
}

export interface ProcessRunActivity {
  name: string;
  run: string;
  run_step?: string;
  actor: string;
  action: "Start" | "Complete" | "Reject" | "Reassign" | "Comment" | "Withdraw" | "Forward" | "Return";
  comment?: string;
  timestamp: string;
}

export interface ProcessRunComment {
  name: string;
  run: string;
  author: string;
  author_name?: string;
  content: string;
  mentions?: string;
  creation: string;
}

export interface ProcessFavorite {
  name: string;
  user: string;
  definition: string;
  definition_title?: string;
}

export interface ProcessSavedFilter {
  name: string;
  user: string;
  filter_name: string;
  filters_json: string;
  share_scope: "Private" | "Department" | "All";
  definition?: string;
}

export interface MyTask {
  run: string;
  run_title: string;
  definition_title: string;
  name: string;
  label: string;
  step_type: string;
  started_at?: string;
  form_schema?: string;
  deadline_at?: string;
}

export interface DashboardStats {
  status_counts: Array<{ status: string; count: number }>;
  backlog: Array<{ definition_title: string; count: number }>;
  recent_completed: Array<{ name: string; title: string; completed_at: string }>;
}

export interface DashboardOverview {
  total: number;
  running: number;
  completed: number;
  cancelled: number;
  draft: number;
  backlog_by_dept: Array<{ department: string; count: number }>;
  backlog_by_person: Array<{ user: string; full_name: string; count: number }>;
}

export interface ProcessTemplate {
  name: string;
  title: string;
  description?: string;
  category: string;
  icon?: string;
  steps_json: string;
  transitions_json: string;
}

export interface ProcessVersion {
  name: string;
  definition: string;
  version_number: number;
  version_label?: string;
  snapshot_json: string;
  created_by: string;
  creation: string;
}

export interface ApiListResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
