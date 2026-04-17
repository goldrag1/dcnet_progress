# dcnet_progress — Codebase Detail

File-by-file map. One line per file. Line numbers refer to key entry points at time of writing and may drift — use as guidance, not truth.

## Repo root

- `pyproject.toml` → package metadata for flit_core build
- `README.md` → short app description
- `.gitignore` → standard Python + node_modules
- `docs/CODEBASE.md` → summary (~200 lines)
- `docs/CODEBASE_DETAIL.md` → this file

## docs/specs/

- `2026-04-12-dcnet-progress-design.md` → Phase 1 spec: data model (10 DocTypes), permission model, API surface
- `2026-04-12-dcnet-progress-phase2-design.md` → Phase 2 spec: branching conditions, deadlines, notifications, realtime
- `2026-04-13-dcnet-progress-form-builder.md` → form builder spec: field palette, schema shape, inline editor

## dcnet_progress/ (inner Python package)

- `__init__.py` → `__version__ = "0.0.1"`
- `hooks.py` → `app_name`, `app_title="DCNet Progress"`, `add_to_apps_screen` (Quy trình → /process), `website_route_rules` (/process/* → process.html), `after_migrate = migrate.after_migrate`, `has_permission.Process Run = permissions.has_process_run_permission`, `scheduler_events.hourly = [engine.check_deadlines]`
- `modules.txt` → "DCNet Progress"
- `patches.txt` → (empty but required by `is_frappe_app()`)
- `engine.py` (484 lines) → BPM runtime. Key functions:
  - `activate_step(run, step_id)` :L120 — marks step Active, assigns, triggers notify
  - `advance_run(run, from_step, action)` :L155 — evaluates transitions, spawns next steps
  - `handle_reject / handle_return / handle_forward` — state transitions
  - `_eval_branching(transition, accumulated_data)` :L250 — condition evaluation
  - `_get_accumulated_form_data(run)` :L82 — merges all prior step `form_data` for condition eval
  - `check_deadlines()` :L420 — hourly scan + escalation
- `notifications.py` (52 lines) → `notify_step_activation(run, step)` writes Notification Log + `frappe.publish_realtime` event
- `permissions.py` (56 lines) → `has_process_run_permission(doc, user)`, `has_process_definition_start_permission(doc, user)`
- `migrate.py` (42 lines) → `after_migrate()` calls `backfill_step_order()` + `migrate_trigger_to_action_trigger()`

## dcnet_progress/api/

- `__init__.py` → empty
- `run.py` (533 lines) → `start()` :L22, `execute_step()` :L119, `get_run_detail()` :L200, `get_my_tasks()`, `get_runs()`, `add_comment()`, `toggle_favorite()`, `save_filter()`
- `definition.py` (294 lines) → `get()` :L36, `save()` :L106 (JSON steps/transitions → child table mapping), `publish()` :L192, `get_templates()`, `create_from_template()`
- `dashboard.py` (157 lines) → `get_overview()` :L10, `get_backlog_by_dept()`, `get_backlog_by_person()`, `export_excel()`

## dcnet_progress/dcnet_progress/doctype/

Each DocType folder has `__init__.py`, `<name>.json` (schema), `<name>.py` (controller stub or logic).

- `process_definition/` → parent DocType, fields: `title`, `category` (Link Process Category), `status` (Draft/Published), child tables `steps` (Process Step), `transitions` (Process Transition)
- `process_step/` → **child table**, fields: `step_id`, `step_type`, `label`, `form_schema` (Long Text JSON), `executor_type`, `executor_value`, `deadline_hours`, `deadline_action`, `email_on_activate`, `email_template`
- `process_transition/` → **child table**, fields: `from_step`, `to_step`, `action_trigger`, `condition_type` (None/Simple/Expression), `condition_json`
- `process_run/` → standalone, fields: `definition` (Link), `status`, `initiator` (Link User), `run_data` (Long Text JSON snapshot), `started_at`, `completed_at`
- `process_run_step/` → standalone, fields: `run` (Link), `step_id`, `status`, `assigned_to` (Link User), `form_data` (Long Text JSON), `started_at`, `completed_at`, `deadline_at`
- `process_run_activity/` → standalone, fields: `run`, `action`, `actor`, `timestamp`, `detail`
- `process_run_comment/` → standalone, fields: `run`, `user`, `content`, `mentions` (comma list)
- `process_favorite/` → standalone, unique (`user`, `definition`)
- `process_saved_filter/` → standalone, fields: `user`, `filter_name`, `filter_json`
- `process_category/` → standalone, fields: `category_name`, `color`

## dcnet_progress/templates/ (21 seed workflows)

Category prefixes: `admin_`, `dcnet_`, `finance_`, `general_`, `hr_`, `it_`, `sales_`. Each JSON has `{ title, category, steps: [...], transitions: [...] }`; every step includes `form_schema`.

- admin: `admin_contract_approval.json`, `admin_document_sign.json`, `admin_meeting_request.json`
- dcnet: `dcnet_incident_response.json`, `dcnet_service_activation.json`
- finance: `finance_invoice_approval.json`, `finance_payment_approval.json`, `finance_purchase_request.json`
- general: `general_2level_approval.json`, `general_review_process.json`, `general_task_approval.json`
- hr: `hr_expense_claim.json`, `hr_leave_request.json`, `hr_overtime.json`, `hr_recruitment.json`, `hr_training_request.json`
- it: `it_asset_request.json`, `it_change_request.json`, `it_support_ticket.json`
- sales: `sales_customer_onboarding.json`, `sales_quote_approval.json`

Loaded by `api.definition.get_templates()` / `create_from_template()`.

## dcnet_progress/www/

- `process.py` (39 lines) → returns `{"no_cache": 1}` to disable Frappe page cache for SPA
- `process.html` → thin HTML shell loading the built React bundle (scripts from `/assets/dcnet_progress/frontend/`)

## dcnet_progress/public/frontend/

- Built Vite output (copied from `frontend/dist/` after `yarn build`). One `index-<hash>.js` (494 lines, minified), CSS, and asset files. Cache-busted via content hash.

## frontend/ (React source)

Top level:
- `index.html` → Vite HTML template
- `package.json` → deps: React 18, react-router, antd, zustand, @xyflow/react, axios, dayjs, tailwindcss
- `vite.config.ts`, `proxyOptions.js` → Vite dev server + proxy to Frappe bench
- `tsconfig.json`, `tsconfig.node.json`
- `tailwind.config.js`, `postcss.config.js`

### frontend/src/

- `main.tsx` (30) → React entry, BrowserRouter with basename `/process`
- `App.tsx` (42) → Routes: `/` → RunInboxPage, `/runs/:id` → RunDetailPage, `/definitions` → ProcessListPage, `/designer/:id` → DesignerPage, `/reports` → ReportsPage, `/settings` → SettingsPage
- `index.css` → Tailwind base + antd overrides

### frontend/src/pages/

- `RunInboxPage.tsx` (165) → sidebar tabs (Cần thực hiện / Đã thực hiện / Nháp / Tất cả / Bộ lọc) + run list
- `RunDetailPage.tsx` (544) → 2-column layout: left = form data + action buttons; right = StepTracker + activity log + comments. `renderFormField` :L78 dispatches by `schema.type`
- `RunListPage.tsx` (103) → flat list view with filters (alternative to inbox)
- `ProcessListPage.tsx` (199) → published definitions list, filter by category + search
- `DesignerPage.tsx` (558) → 3-panel designer. Left: step list + add/delete. Center: 5-tab step config (General / Form / Executor / Deadline / Email). Right: field palette (drag/click to add to form_schema). Uses `FormBuilder` for "Biểu mẫu" tab, `BranchingModal` for transitions
- `ProcessDesignerPage.tsx` (368) → earlier/alternate designer variant (likely superseded by DesignerPage — review before editing)
- `DashboardPage.tsx` (104) → 5 KPI cards + backlog tables (by dept, by person)
- `ReportsPage.tsx` (129) → wraps DashboardPage with additional report widgets + Excel export button
- `MyTasksPage.tsx` (111) → legacy page, redirects/proxies to RunInboxPage
- `SettingsPage.tsx` (15) → placeholder

### frontend/src/components/

- `designer/FormBuilder.tsx` (308) → visual field builder. Palette click → `addFieldToSchema()` → card renders with inline edit popover. Field types: text, number, date, select, multi-select, user, department, table, attachment, textarea
- `designer/BranchingModal.tsx` (211) → transition condition editor. Simple mode (field op value) or Expression mode (raw JSON)
- `designer/TemplatePickerModal.tsx` (73) → list templates by category, preview + "Create from template" action
- `run/StartRunModal.tsx` (76) → initial form for starting a run (pick definition + first-step form data)
- `layout/AppLayout.tsx` (90) → shell: top tab bar (Quy trình / Lượt chạy / Thiết kế / Báo cáo / Thiết lập), outlet

### frontend/src/api/

- `client.ts` (232) → axios wrapper with CSRF header auto-attached. Methods: `getDefinition`, `saveDefinition`, `publishDefinition`, `getRuns`, `getMyTasks`, `getRunDetail`, `startRun`, `executeStep`, `addComment`, `toggleFavorite`, `saveFilter`, `getOverview`, `getBacklog*`, `exportExcel`, `getTemplates`, `createFromTemplate`
- `types.ts` (184) → TS interfaces: `FormField`, `ProcessStep`, `ProcessTransition`, `ProcessDefinition`, `ProcessRun`, `ProcessRunStep`, `ActivityEntry`, `CommentEntry`, `DashboardOverview`, `BacklogRow`

### frontend/src/utils/

- `slug.ts` (25) → `vnSlug(text)` — Vietnamese diacritics → ASCII underscore key, used to derive form field `name` from label

## Key data flow (reference)

1. **Designer save**: `DesignerPage` serializes steps + transitions (each step's `form_schema` is a JSON string) → `POST /api/method/dcnet_progress.api.definition.save` → `api.definition.save()` :L106 deletes existing child rows and re-inserts from JSON.
2. **Start**: `api.run.start()` :L22 reads `defn.steps` (child table), snapshots full step list into `process_run.run_data` (JSON), creates Process Run Step rows with `status="Waiting"`, activates step 1 via `engine.activate_step`.
3. **Render form**: `RunDetailPage` reads `form_schema` from the run_data snapshot (NOT live definition) and renders via `renderFormField()` :L78.
4. **Submit**: `api.run.execute_step()` :L119 saves `form_data` to Process Run Step → calls `engine.advance_run()` → transitions evaluated with accumulated form data across all prior steps → next steps activated + notifications fired.
5. **Branching**: `_eval_branching()` :L250 reads `transition.condition_json` + calls `_get_accumulated_form_data()` :L82 to merge all prior Process Run Step.form_data into one dict for expression evaluation.
6. **Deadlines**: hourly `engine.check_deadlines()` :L420 queries Process Run Step where `deadline_at < now()` and `status = Active` → sends escalation email + realtime alert per `step.deadline_action`.

## Where to look for common changes

- Add a new field type to form builder → `frontend/src/components/designer/FormBuilder.tsx` (palette entry + editor) + `frontend/src/pages/RunDetailPage.tsx` (`renderFormField`)
- Add a new API endpoint → new `@frappe.whitelist()` fn in `api/run.py` / `api/definition.py` / `api/dashboard.py` → add matching method in `frontend/src/api/client.ts`
- Add a new DocType → `dcnet_progress/dcnet_progress/doctype/<name>/`, include in `modules.txt` if new module, add migration if altering existing DocTypes
- Change branching semantics → `engine._eval_branching` + `BranchingModal.tsx`
- Change notification channel → `notifications.py` + add subscription in frontend
