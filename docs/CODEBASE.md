# dcnet_progress — Codebase Summary

**Lines of code:** ~7,400 (Python: 1,769 | TS/TSX: 3,567 | JSON: 2,110) — excluding node_modules/build/__pycache__. Tests: none yet.

## Overview

BPM (Business Process Management) app for ERPNext — a Misa Amis clone. Users define reusable **Process Definitions** (workflow templates) with steps + transitions + per-step form schemas; end users start **Process Runs** from published definitions and advance through approval steps with dynamic forms, branching, deadlines, and comments.

Phase 1 + 2 backend complete: DocType model, execution engine, REST API, React SPA (inbox / detail / designer / dashboard). 21 seed template JSONs ship with the app. Form builder (visual field palette → schema) works end-to-end. Designer UX gaps remain around executor type, "Thông tin chung" section, and tab visibility.

## Stack

- **Backend:** Frappe v16 (Python) — regular DocTypes (not submittable), child tables for steps/transitions.
- **Frontend:** React + TypeScript (Vite), Ant Design, React Router, Zustand, `@xyflow` (React Flow for BPMN-style canvas), Tailwind. Built output copied into `dcnet_progress/public/frontend/` and served via Frappe website route `/process/*` → `process.html`.
- **State snapshot model:** A Process Run snapshots `definition.steps` at start time into `run_data` (JSON). Per-step `form_data` is persisted on each Process Run Step row — decoupled from live definition edits after run creation.

## Directory tree

```
apps/dcnet_progress/
├── pyproject.toml, README.md, .gitignore
├── docs/
│   ├── CODEBASE.md              ← this file (summary)
│   ├── CODEBASE_DETAIL.md       ← full file-by-file map
│   └── specs/
│       ├── 2026-04-12-dcnet-progress-design.md          (Phase 1)
│       ├── 2026-04-12-dcnet-progress-phase2-design.md   (Phase 2)
│       └── 2026-04-13-dcnet-progress-form-builder.md    (form builder)
├── dcnet_progress/              ← inner Python package
│   ├── __init__.py              (version 0.0.1)
│   ├── hooks.py                 (routes, after_migrate, scheduler, permissions)
│   ├── modules.txt              ("DCNet Progress")
│   ├── patches.txt
│   ├── engine.py                (BPM execution — 484 lines)
│   ├── notifications.py         (realtime + Notification Log)
│   ├── permissions.py           (has_permission hooks)
│   ├── migrate.py               (after_migrate backfills)
│   ├── api/                     (3 REST modules: run / definition / dashboard)
│   ├── dcnet_progress/
│   │   └── doctype/             (10 DocTypes — see below)
│   ├── templates/               (21 seed JSON workflows)
│   ├── www/
│   │   ├── process.py, process.html   (SPA entry)
│   └── public/frontend/         (built Vite assets)
└── frontend/                    ← React source
    ├── src/App.tsx, main.tsx, index.css
    ├── src/pages/               (8 page components)
    ├── src/components/          (designer/, run/, layout/)
    ├── src/api/                 (client.ts, types.ts)
    ├── src/utils/slug.ts        (Vietnamese → ASCII key)
    ├── vite.config.ts, proxyOptions.js, package.json
```

## Data model (10 DocTypes)

**Parent + child tables (definition side):**
- **Process Definition** — reusable workflow template; child tables `steps`, `transitions`; published to make available to end users.
- **Process Step** (child of Definition) — `step_id`, `step_type`, `label`, `form_schema` (JSON string), `executor_type`, `executor_value`, deadline + email config.
- **Process Transition** (child of Definition) — `from_step`, `to_step`, `action_trigger`, `condition_type`, `condition_json` (for branching).

**Runtime side (standalone DocTypes, one row per instance):**
- **Process Run** — `definition` (Link), `status`, `initiator`, `run_data` (JSON snapshot of definition at start), `started_at`.
- **Process Run Step** — one row per step execution: `run` (Link), `step_id`, `status`, `assigned_to`, `form_data` (JSON user input), `started_at`, `completed_at`.
- **Process Run Activity** — append-only audit log (`run`, `action`, `actor`, `timestamp`).
- **Process Run Comment** — comments with `mentions`.

**User preferences:**
- **Process Favorite** — unique (user, definition) pair.
- **Process Saved Filter** — user-saved list view filters.
- **Process Category** — taxonomy for definitions.

See `CODEBASE_DETAIL.md` for each DocType's full field list.

## Entry points

- `dcnet_progress/hooks.py` — `website_route_rules` maps `/process/*` → SPA; `after_migrate` backfills; `scheduler_events.hourly` runs `engine.check_deadlines`; `has_permission.Process Run` delegates to `permissions.py`.
- `dcnet_progress/www/process.py` — `{"no_cache": 1}` page handler; `process.html` bootstraps React SPA.
- REST API (all `@frappe.whitelist`, called from SPA):
  - `api.run.start / execute_step / get_run_detail / get_my_tasks / get_runs / add_comment / toggle_favorite / save_filter`
  - `api.definition.get / save / publish / get_templates / create_from_template`
  - `api.dashboard.get_overview / get_backlog_by_dept / get_backlog_by_person / export_excel`
- SPA routes (`frontend/src/App.tsx`): `/` (inbox), `/runs/:id`, `/definitions`, `/designer/:id`, `/reports`, `/settings`.

## Core flows

1. **Design template** — `DesignerPage` (3-panel: step list | 5-tab step config | field palette). `FormBuilder` adds/edits fields visually, writes `form_schema` JSON into the step. `BranchingModal` edits transition conditions. Save calls `api.definition.save` which maps `steps_json` + `transitions_json` → child table rows via the definition controller.
2. **Publish** — `api.definition.publish` flips status; only published definitions appear in Start Run picker.
3. **Start run** — `api.run.start` reads `definition.steps` (child table), snapshots them into `process_run.run_data` (JSON), creates one Process Run Step per step, activates the first step via `engine.activate_step`.
4. **Execute step** — `RunDetailPage` renders the step form dynamically from `run_data` schema (`renderFormField`). User submits → `api.run.execute_step` saves `form_data` → `engine.advance_run` evaluates transitions (may branch via `_eval_branching` using `_get_accumulated_form_data` across prior steps) → activates next step(s) → `notifications.notify_step_activation` pushes realtime + Notification Log.
5. **Reject / Return / Forward** — `engine.handle_reject / handle_return / handle_forward` mutate run state and log Activity rows.
6. **Deadlines** — hourly `engine.check_deadlines` scans active steps with `deadline_*` and triggers escalation emails + realtime alerts.
7. **Reporting** — `DashboardPage` + `ReportsPage` query `api.dashboard` for KPIs, backlog-by-dept, backlog-by-person tables; Excel export available.

## Read first

1. `dcnet_progress/hooks.py` — entry registration (small, read in full).
2. `docs/specs/2026-04-12-dcnet-progress-design.md` — Phase 1 design (data model, permission model).
3. `docs/specs/2026-04-12-dcnet-progress-phase2-design.md` — Phase 2 (branching, deadlines, notifications).
4. `dcnet_progress/engine.py` — `activate_step` + `advance_run` are the heart of the runtime.
5. `frontend/src/pages/DesignerPage.tsx` — 558-line designer (the largest UI surface).
6. `dcnet_progress/api/definition.py` — `save()` does the JSON → child table mapping; worth understanding before editing the designer.

## Known gaps (as of 2026-04-17)

- Designer: executor type UX, "Thông tin chung" section, tab visibility still not final (per project memory).
- No test suite yet (`test_*.py` count = 0).
- Not pushed to `dcnet-cloud` remote — lives on `goldrag1/dcnet_progress` only.
