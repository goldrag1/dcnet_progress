# CODEBASE.md — dcnet_progress

## Backend: dcnet_progress/dcnet_progress/
- `__init__.py` → version 0.0.1
- `hooks.py` → website_route_rules (/process→process.html), scheduler_events (hourly check_deadlines), has_permission hooks
- `engine.py` → BPM execution engine: activate_step():L120, advance_run():L155, handle_reject/return/forward, check_deadlines():L420, _eval_branching():L250, _get_accumulated_form_data():L82
- `notifications.py` → notify_step_activation(), Notification Log + publish_realtime
- `permissions.py` → has_process_run_permission(), has_process_definition_start_permission()
- `migrate.py` → backfill_step_order(), migrate_trigger_to_action_trigger()

## API: dcnet_progress/api/
- `run.py` → start():L22, execute_step():L119, get_run_detail():L200, get_my_tasks(), get_runs(), add_comment(), toggle_favorite(), save_filter()
- `definition.py` → get():L36, save():L106 (JSON→child table mapping), publish():L192, get_templates(), create_from_template()
- `dashboard.py` → get_overview():L10, get_backlog_by_dept(), get_backlog_by_person(), export_excel()

## DocTypes: dcnet_progress/dcnet_progress/doctype/
- `process_definition/` → parent DocType, has child tables: steps (Process Step), transitions (Process Transition)
- `process_step/` → child table: step_id, step_type, label, form_schema(JSON str), executor_type, executor_value, deadline_*, email_*
- `process_transition/` → child table: from_step, to_step, action_trigger, condition_type, condition_json
- `process_run/` → standalone: definition(Link), status, initiator, run_data(JSON snapshot), started_at
- `process_run_step/` → standalone: run(Link), step_id, status, assigned_to, form_data(JSON), started_at, completed_at
- `process_run_activity/` → standalone: run, action, actor, timestamp
- `process_run_comment/` → standalone: run, user, content, mentions
- `process_favorite/` → standalone: user, definition (unique pair)
- `process_saved_filter/` → standalone: user, filter_name, filter_json
- `process_category/` → standalone: category_name

## Templates: dcnet_progress/templates/
- 21 JSON files (finance_*, hr_*, admin_*, it_*, sales_*, general_*, dcnet_*) — each has steps + transitions + form_schema

## Frontend: frontend/src/
- `main.tsx` → React entry, BrowserRouter
- `App.tsx` → Routes: / → RunInboxPage, /runs/:id → RunDetailPage, /definitions → ProcessListPage, /designer/:id → DesignerPage, /reports → ReportsPage, /settings → SettingsPage

### Pages: frontend/src/pages/
- `DesignerPage.tsx` → 3-panel designer: step list | step config (5 tabs) | field palette. Uses FormBuilder for "Biểu mẫu" tab
- `RunInboxPage.tsx` → sidebar (Cần thực hiện/Đã thực hiện/Nháp/Tất cả/Bộ lọc) + run list
- `RunDetailPage.tsx` → 2-column: form data + actions (left) | step tracker + activity log (right). renderFormField():L78 renders dynamic form fields
- `ProcessListPage.tsx` → definition list with filter/pagination
- `DashboardPage.tsx` → 5 stat cards + backlog tables
- `ReportsPage.tsx` → wraps DashboardPage
- `SettingsPage.tsx` → placeholder
- `MyTasksPage.tsx` → legacy, redirects to RunInboxPage

### Components: frontend/src/components/
- `designer/FormBuilder.tsx` → visual form field builder (click palette → card → inline editor). addFieldToSchema() helper
- `designer/TemplatePickerModal.tsx` → template category filter + select
- `designer/BranchingModal.tsx` → transition condition editor
- `layout/TopNav.tsx` → top tab bar (Quy trình/Lượt chạy/Thiết kế/Báo cáo/Thiết lập)
- `run/StepTracker.tsx` → vertical step timeline with status colors

### API Client: frontend/src/api/
- `client.ts` → fetch wrapper with CSRF, all API calls (getDefinition, saveDefinition, executeStep, etc.)
- `types.ts` → FormField, ProcessStep, ProcessDefinition, ProcessRun, ProcessRunStep interfaces

### Utils: frontend/src/utils/
- `slug.ts` → vnSlug() — Vietnamese diacritics → ASCII underscore key

## Key Data Flow
1. Designer saves steps_json → definition.save() maps to child table rows (Process Step)
2. start() reads defn.steps (child table) → builds run_data snapshot (JSON) → creates Process Run Step records
3. RunDetailPage reads form_schema from run_data snapshot, renders dynamic form via renderFormField()
4. execute_step() saves form_data (user input) to Process Run Step.form_data (JSON)
5. engine.advance_run() reads accumulated form_data for branching condition evaluation

## www/
- `process.py` → Frappe website route, returns {"no_cache": 1}
- `process.html` → built React SPA (copied from frontend build output)
