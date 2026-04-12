// TypeScript interfaces matching actual DocType fields in dcnet_progress

export interface ProcessStep {
  step_id: string;
  step_type: "Start" | "Task" | "Approval" | "Fork" | "Join" | "End";
  label: string;
  assigned_role?: string;
  assigned_user?: string;
  form_schema?: string; // JSON
  is_parallel?: 0 | 1;
  parallel_group?: string;
  auto_complete?: 0 | 1;
  sla_hours?: number;
}

export interface ProcessTransition {
  from_step: string;
  to_step: string;
  condition?: string;
  label?: string;
}

export interface ProcessDefinition {
  name: string;
  title: string;
  description?: string;
  status: "Draft" | "Published" | "Suspended";
  version: number;
  steps_json?: string; // JSON array of ProcessStep
  transitions_json?: string; // JSON array of ProcessTransition
  owner?: string;
  creation?: string;
  modified?: string;
}

export interface ProcessRun {
  name: string;
  definition: string;
  definition_title: string;
  title: string;
  status: "Running" | "Completed" | "Cancelled" | "Rejected";
  initiator: string;
  started_at?: string;
  completed_at?: string;
  run_data?: string; // JSON snapshot of definition at start time
  context_json?: string; // JSON key-value pairs
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
  form_data?: string; // JSON
}

export interface ProcessRunActivity {
  name: string;
  run: string;
  run_step?: string;
  actor: string;
  action: "Start" | "Complete" | "Reject" | "Reassign" | "Comment" | "Withdraw";
  comment?: string;
  timestamp: string;
}

export interface MyTask {
  run: string;
  run_title: string;
  definition_title: string;
  step_name: string;
  step_label: string;
  step_type: string;
  started_at?: string;
  form_schema?: string;
}

export interface DashboardStats {
  status_counts: Array<{ status: string; count: number }>;
  backlog: Array<{ definition_title: string; count: number }>;
  recent_completed: Array<{ name: string; title: string; completed_at: string }>;
}

export interface ApiListResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
