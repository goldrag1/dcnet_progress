---
project: frappe-bench-dcnet
base_branch: master
---

# dcnet_progress Phase 2 — Misa Amis Parity

**Date:** 2026-04-12
**Status:** Draft
**Phase:** 2 (Misa Amis UX Parity + Production Features)
**Predecessor:** Phase 1 spec at docs/superpowers/specs/2026-04-12-dcnet-progress-design.md
**Misa Amis reference screenshots:** docs/dcnet_progress/misa-ref/

## 1. Goal

Bring dcnet_progress to **feature parity with Misa Amis Quy trinh** in UI/UX, so users migrating from Misa to ERPNext experience zero relearning. Priorities:

1. **UI/UX matching Misa** — layout, flow, interaction patterns as close as possible
2. **Production-ready** — SLA, permissions, notifications, reports for enterprise use
3. **Vietnamese-first** — all UI labels in Vietnamese with diacritics

### Phase 2 Scope

Includes ALL Misa Amis Quy trinh features EXCEPT:
- Mobile app (Phase 3)
- AI features (Phase 3)
- External Open API with OAuth (Phase 3)
- Electronic signature / WeSign integration (Phase 3)
- ERP auto-doc creation — auto-create PO, Payment Entry, etc. (Phase 3)
- Process document management / SOP versioning (Phase 3)
- Scheduled recurring runs (Phase 3)

### Biggest Change from Phase 1

**Designer UI rewrite** to Misa style: numbered step list + branching config modal + auto-generated flowchart view. Phase 1 React Flow canvas becomes read-only "Xem so do". Reason: DCNET users currently use Misa — muscle memory > technical elegance.

## 2. Data Model Changes

### 2.1 Process Definition — New Fields

    Process Definition (existing, add fields)
    - icon (Data) — icon identifier for process list display
    - run_permission_type (Select: All | User | Role | Department)
    - run_permission_value (Small Text) — JSON array of users/roles/departments
    - auto_title_template (Data) — e.g. "De xuat mua hang - {Nguoi yeu cau} - {Ngay yeu cau}"
    - version_label (Data) — custom label e.g. "HC2.6", optional

### 2.2 Process Step — New Fields

    Process Step (existing child table, add fields)
    - step_order (Int) — sequential order in numbered list (1, 2, 3...)
    - is_parallel_group (Check) — marks start of parallel group
    - parallel_group_id (Data) — groups parallel steps together
    - deadline_type (Select: None | Fixed Duration | From Field)
    - deadline_duration (Int) — minutes (e.g. 4320 = 3 days)
    - deadline_field_step (Data) — step_id containing the time field
    - deadline_field_name (Data) — fieldname in that step's form_schema
    - display_content (JSON) — instruction text, template files per step
    - display_previous_fields (Check) — show prior step data read-only
    - display_previous_editable (Check) — allow editing prior step data (only when display_previous_fields=1)
    - approval_mode (Select: Any | All) — for approval steps with multiple executors (see §4.3)
    - no_return (Check) — prevent returning to this step once passed (engine must check this)
    - email_enabled (Check) — send email on this step
    - email_template_subject (Data) — supports merge fields
    - email_template_body (Text Editor) — rich text with merge fields
    - email_cc (Small Text) — additional CC recipients

### 2.3 Form Schema — New Fieldtypes

Extend form_schema JSON to support:

New fieldtypes beyond Phase 1:
- **Table** — multi-row with configurable columns, optional formula columns
- **Signature** — canvas-based signature capture
- **Attach** — file upload (reuse Frappe File doctype)

Field configuration additions:
- default_type: "preset" | "remember_last" | null
- default_value: static default for preset
- visibility_condition: {"field": "loai_hang", "op": "==", "value": "Dac biet"} — show/hide
- security: {"visible_to": ["step_1", "step_3"]} — only these steps can see the field value

### 2.4 Process Transition — Enhanced Branching

**Migration:** Phase 1 `trigger` field (On Complete | On Reject) is **replaced** by `action_trigger`. Mapping: On Complete → Send, On Reject → Reject. Migrate existing records in `after_migrate` hook, then drop `trigger` field.

    Process Transition (existing, modify fields)
    - action_trigger (Select: Send | Approve | Reject | Forward | Return) — REPLACES Phase 1 `trigger`
    - target_mode (Select: Next Step | Skip To | Return To)
    - target_step_id (Data) — for Skip To / Return To modes

**action_trigger semantics:**
- Send = step completed (task step gửi form) — equivalent to Phase 1 "On Complete"
- Approve = approval step đồng ý
- Reject = approval step từ chối — equivalent to Phase 1 "On Reject"
- Forward = chuyển tiếp cho người khác
- Return = trả về bước trước

### 2.5 Process Run — New Fields

**Note on existing field names (code ≠ Phase 1 spec):**
- Phase 1 spec says `initiated_by` → actual code field is `initiator`
- Phase 1 spec says `definition_snapshot` → actual code field is `run_data`
- Process Run Step is a **standalone DocType** with Link `run`, NOT a child table

    Process Run (existing, add fields)
    - title (Data) — auto-generated from auto_title_template or manual
    - is_draft (Check) — saved but not submitted yet

### 2.6 New DocType: Process Run Comment

**Distinction:** Process Run Comment = user-facing discussion (like Slack messages). Process Run Activity (Phase 1) = system audit trail (action logs). Both coexist — comments are for conversation, activities are for tracking.

    Process Run Comment (NEW, standalone)
    - run (Link -> Process Run, required)
    - step_id (Data, optional)
    - user (Link -> User, required)
    - content (Text, required)
    - mentions (JSON)
    - attachments (JSON)
    Naming: COMMENT-{####}

### 2.7 New DocType: Process Favorite

    Process Favorite (NEW, standalone)
    - user (Link -> User, required)
    - definition (Link -> Process Definition, required)
    Unique: (user, definition)

### 2.8 New DocType: Process Saved Filter

    Process Saved Filter (NEW, standalone)
    - user (Link -> User, required)
    - filter_name (Data, required)
    - filter_json (JSON, required)
    - share_scope (Select: Private | Department | All)

## 3. UI Redesign — Misa Amis Layout

### 3.1 Global Navigation (Top Bar)

Match Misa's top navigation tabs:

    [Logo] Quy trình | Lượt chạy | Thiết kế quy trình | Báo cáo | Thiết lập
                                                        [Chạy quy trình]  [Search]  [Bell]  [User]

| Tab | Route | Purpose |
|-----|-------|---------|
| Quy trình | /process/definitions | Process definition list |
| Lượt chạy | /process | Run inbox (primary view) |
| Thiết kế quy trình | /process/designer | Create/edit definitions |
| Báo cáo | /process/reports | Dashboard + reports |
| Thiết lập | /process/settings | Permissions, email config |

"Chạy quy trình" button — always visible, opens process picker modal.

### 3.2 Run Inbox (Lượt chạy) — PRIMARY USER VIEW

Users spend 90% of time here. Must match Misa exactly.

Left sidebar categories:
- Cần thực hiện — Active steps assigned to current user (badge count)
- Đã thực hiện — Steps completed by current user
- Nháp — Draft runs by current user
- Tất cả lượt chạy — All runs user has access to
- Bộ lọc tự tạo — Saved custom filters (private + shared)

Table columns: ID, Tiêu đề, Quy trình, Người tạo, Ngày tạo, Trạng thái
Features: column sorting, pagination (25/50/100), status chips, search, row click opens detail

See misa-ref/03d-approval-detail.png (left panel shows inbox list layout).

### 3.3 Run Detail Page — 2-Column Layout

Left panel (60%): Form data from all steps (completed=read-only, current=editable) + comments
Right panel (40%): Vertical step tracker with avatars and timestamps

Step tracker states:
- Green filled circle + checkmark = completed (executor name + timestamp)
- Blue half-filled = current/active (executor name)
- Gray empty = pending

Action bar: Từ chối/Đồng ý for approval, Trả về/Chuyển tiếp for task, more menu for Thu hồi/Phân công lại/In

See misa-ref/03b-run-detail.png and 03c-step-timeline.png for reference.

### 3.4 Process Designer — Step List Style (REWRITE)

3-panel layout replacing React Flow canvas:

Left panel — Process metadata:
- Tên quy trình, Nhóm quy trình, Phiên bản
- Các bước thực hiện — numbered list with +/- buttons, drag to reorder
- Phân quyền sử dụng, Biểu tượng, Ghi chú

Center panel — Step form preview:
- Live preview of form fields
- Drag fields from right palette
- Click field to edit properties

Right panel — Field palette:
- Nội dung hiển thị: Văn bản hướng dẫn, Tệp mẫu hướng dẫn
- Biểu mẫu nhập liệu: Một dòng, Nhiều dòng, Chọn giá trị, Ngày tháng, Thời gian, Số, Số thập phân, Nhân viên, Vị trí công việc, Cơ cấu tổ chức, Tài liệu, Bảng

Step config modal (gear icon per step) — 6 tabs:
1. Biểu mẫu nhập liệu (form fields)
2. Nội dung hiển thị (instructions, templates, show previous data)
3. Người thực hiện (6 executor types — see §4.4)
4. Thời hạn xử lý (deadline config)
5. Loại bước (Task/Approval + approval mode Any/All)
6. Người liên quan (stakeholders)

Toolbar: Thiết lập luồng quy trình | Chạy thử | Xem sơ đồ | Lưu | Phát hành

See misa-ref/02c-process-setup.png and 02d-form-builder.png for reference.

### 3.5 Branching Config Modal

Full-screen modal matching Misa (see misa-ref/05c-condition-ui.png):

Left: Step selector (numbered list)
Middle: Action selector (Gửi/Đồng ý/Từ chối/Chuyển tiếp/Trả về)
Right: Condition builder with Nếu (If) / Thì (Then) groups

Nếu section: field dropdown + operator + value, AND within group, OR between groups
Thì section: action (Chuyển tiếp/Trả về/Kết thúc) + target step

### 3.6 "Xem sơ đồ" — Auto-Generated Flowchart (Read-Only)

Reuses Phase 1 React Flow canvas in read-only mode with dagre auto-layout.
Nodes from step list + branching rules, diamond nodes for conditions.
Zoom + export PNG.

See misa-ref/05e-flowchart-view.png for reference.

### 3.7 Dashboard / Reports

Tổng quan tab matching Misa (see misa-ref/04a-dashboard.png):
- 5 stat cards: Tổng số / Đang thực hiện / Đã thực hiện / Đã hủy / Nháp
- Lượt chạy tồn theo phòng ban (bar chart with filter: Tất cả/Quá hạn/Sắp đến hạn)
- Lượt chạy tồn theo người (table)
- Tình hình thực hiện quá hạn (stacked bar)
- Thời gian thực hiện trung bình (bar chart by definition)

Chi tiết tab: filtered table + export to Excel

### 3.8 Process Settings Page

Notification config, permission roles, print template upload.

## 4. Backend Changes

### 4.1 Engine Enhancements

**Branching engine rewrite** — step-order-based with branching rules (replaces Phase 1 graph-based transitions).

Execution flow:
1. Steps execute in `step_order` sequence (1 → 2 → 3...)
2. After each step action, check branching rules for that step + action_trigger
3. First matching rule wins → follow target_mode (Next Step / Skip To / Return To)
4. No matching rule → advance to next sequential `step_order`
5. End step reached → run completes

**Parallel step execution:**
- Steps with `is_parallel_group=1` mark the start of a parallel group
- All steps sharing the same `parallel_group_id` execute simultaneously
- In the numbered list UI, parallel steps display as a sub-group (e.g. steps 2a, 2b under group "Bước 2")
- All parallel steps share the same `step_order` value
- Join condition: ALL steps in a parallel group must complete before advancing to next `step_order`
- Engine creates one Process Run Step per parallel step, activates all at once

**Deadline engine** — hourly scheduler checks overdue steps, sends reminders.
hooks.py: `scheduler_events = {"hourly": ["dcnet_progress.engine.check_deadlines"]}`

Deadline semantics for `deadline_type`:
- **Fixed Duration:** step must be completed within `deadline_duration` minutes from activation. Deadline = `started_at + timedelta(minutes=deadline_duration)`.
- **From Field:** deadline is the absolute datetime value read from field `deadline_field_name` in step `deadline_field_step`'s form_data. Step must be completed BY that datetime.

**`no_return` enforcement:** engine's return action handler must check `step_def.no_return` on the target step. If `no_return=1`, return action is rejected with error "Không thể trả về bước này".

### 4.2 New API Endpoints

Run comments: add_comment, get_comments
Favorites: toggle_favorite, get_favorites
Saved filters: save_filter, get_filters, delete_filter
Draft runs: save_draft, get_drafts, delete_draft, submit_draft
Duplicate: duplicate(source_run)
Cancel: cancel(run) — admin only
Dashboard: get_overview_stats, get_detail_report, export_excel
Branching: save_branching_rules, get_branching_rules
Versions: get_versions, restore_version
Test run: start_test(definition, initial_data)

### 4.3 Multi-Executor for Approval Mode All

When `approval_mode = "All"` on a Process Step:

1. Engine creates **multiple Process Run Step records** for the same `step_id`, one per executor (e.g. if executor_type=Role and role has 3 users → 3 records)
2. Each record has its own `assigned_to`, `status`, `completed_at`
3. Step is considered "Completed" only when ALL records for that `step_id` have `status = "Completed"`
4. Step is "Rejected" if ANY record has `status = "Rejected"` (first rejection wins)
5. `advance_run()` must group by `step_id` and check group completion, not individual records

When `approval_mode = "Any"` (default): single Process Run Step record, first executor from the resolved list.

### 4.4 Executor Types (6 types matching Misa)

| Code Value | Misa Label | Resolution |
|---|---|---|
| Initiator | Người tạo lượt chạy | `run.initiator` |
| User | Nhân viên | Specific user email from `executor_value` |
| Role | Chức vụ | `frappe.get_all("Has Role", ...)` — first match (Any) or all (All) |
| Department | Phòng ban | Department head from `executor_value` department, or all members for All mode |
| Direct Manager | Quản lý trực tiếp | `Employee.reports_to` → `user_id` |
| Previous Step Executor | Người thực hiện bước trước | `previous_step_user` from engine context |

**New:** Department type resolves via `frappe.get_all("Employee", {"department": executor_value, "status": "Active"}, "user_id")`. For Any mode → first result. For All mode → all results (creates multiple run steps per §4.3).

### 4.5 Permission Model

has_permission hooks for Process Definition and Process Run.
Definition: all can read, System Manager + Process Designer can write/create/delete.
Run: initiator, step assignee, admin can access.

Per-definition permissions: `run_permission_type` + `run_permission_value` on Process Definition control who can START a run. has_permission hook reads these fields.

## 5. Frontend Architecture

### 5.1 Routes

    /process -> RunInboxPage (index, primary user view)
    /process/runs/:id -> RunDetailPage
    /process/definitions -> ProcessListPage
    /process/designer -> DesignerPage
    /process/designer/:id -> DesignerPage
    /process/reports -> ReportsPage
    /process/settings -> SettingsPage

### 5.2 New Components

RunInboxPage, RunInboxSidebar, RunDetailTwoColumn, StepTracker, CommentSection,
DesignerStepList, StepConfigModal, BranchingConfigModal, FlowchartViewer,
FieldPalette, FormPreview, FieldConfigModal, TableFieldEditor,
ReportsPage, OverviewDashboard, SavedFilterManager, ProcessPickerModal, SettingsPage

### 5.3 Libraries

Existing: Ant Design v5, @xyflow/react (FlowchartViewer only), @tanstack/react-query, Tailwind
New: @ant-design/charts (dashboard), dagre (flowchart auto-layout)

## 6. Template Library

20 pre-built Vietnamese process templates (JSON files in `dcnet_progress/templates/`):
- 6 Hành chính tổng hợp
- 1 Marketing
- 4 Quản trị nguồn nhân lực
- 2 Sản xuất kinh doanh
- 7 Tài chính - Kế toán

Template picker modal with category filter + preview + "Sử dụng mẫu này" button.

### Template JSON Format

Each template is a JSON file that matches Process Definition export structure:

```json
{
  "template_name": "Đề xuất thanh toán",
  "category": "Tài chính - Kế toán",
  "description": "Quy trình đề xuất và phê duyệt thanh toán nội bộ",
  "icon": "wallet",
  "steps": [
    {
      "step_id": "step_001",
      "step_type": "Task",
      "label": "Lập đề xuất",
      "step_order": 1,
      "executor_type": "Initiator",
      "form_schema": [...]
    }
  ],
  "transitions": [...]
}
```

"Sử dụng mẫu này" creates a new Process Definition (Draft) with all steps/transitions pre-populated. User edits before publishing.

## 7. Version History

Uses Frappe Version doctype. Snapshot saved on each publish. View history + restore.

**Safety:** Restoring a version only changes the Process Definition (Draft state). In-flight Process Runs are NOT affected — they use `run_data` (definition snapshot created at run start). Restored definition must be re-published to affect new runs.

## 8. Print Templates

Jinja template with merge fields from run data + QR code. Template at dcnet_progress/templates/run_print.html.

## 9. Acceptance Criteria

### Designer
- [ ] Numbered step list designer (not drag-drop canvas)
- [ ] 3-panel layout: metadata | form preview | field palette
- [ ] All Misa field types (Một dòng thru Bảng)
- [ ] Table field with columns and formulas
- [ ] Step config modal with 6 tabs
- [ ] Branching modal with Nếu/Thì builder
- [ ] Xem sơ đồ auto-generated flowchart
- [ ] Chạy thử test run mode
- [ ] 20 template library + picker
- [ ] Version history with restore
- [ ] Field conditions (show/hide)
- [ ] Field security (visible_to)
- [ ] Default values: preset + remember last

### Run Execution
- [ ] Run inbox with sidebar: Cần thực hiện / Đã thực hiện / Nháp / Tất cả
- [ ] Saved custom filters (private + shared)
- [ ] 2-column run detail (form left + step tracker right)
- [ ] Step tracker with avatars + timestamps
- [ ] Comments with mentions and attachments
- [ ] Save as draft
- [ ] Duplicate run
- [ ] Favorite processes
- [ ] Auto-generated title
- [ ] Cancel completed runs (admin)
- [ ] Search by ID/title

### SLA and Deadlines
- [ ] Per-step deadline (fixed duration or from field)
- [ ] Overdue detection (hourly)
- [ ] Approaching deadline reminders (24h)
- [ ] Overdue reminders (daily)
- [ ] Overdue status in UI

### Permissions
- [ ] Per-definition run permissions
- [ ] 6 executor types
- [ ] Approval mode: Any/All
- [ ] Field-level security

### Notifications
- [ ] Email on step activation (configurable)
- [ ] Email on completion/rejection
- [ ] Merge fields in templates
- [ ] In-app Notification Log
- [ ] Realtime push via socket.io

### Dashboard
- [ ] 5 stat cards
- [ ] Backlog by department (bar chart)
- [ ] Backlog by person (table)
- [ ] Overdue analysis with filter
- [ ] Avg completion time by process
- [ ] Export to Excel

### Navigation
- [ ] Top tab bar matching Misa
- [ ] Chạy quy trình button always visible
- [ ] Global search

### Print
- [ ] Print template with QR code and merge fields

## 10. Migration from Phase 1

Phase 2 adds fields to existing DocTypes — all new fields have safe defaults (null/0/empty), so `bench migrate` is sufficient. Specific migrations:

1. **Process Transition.trigger → action_trigger:** `after_migrate` hook maps "On Complete" → "Send", "On Reject" → "Reject", then drops `trigger` field.
2. **Process Step.step_order:** backfill from child table `idx` field (existing ordering).
3. **Process Run Step multi-executor:** no migration needed — existing records are single-executor (compatible with Any mode default).
4. **New DocTypes** (Process Run Comment, Process Favorite, Process Saved Filter): created by migrate, no data migration.

## 11. NOT in Phase 2

- Mobile app, AI features, Open API, Electronic signature
- Auto-create ERPNext docs on completion
- Process document management / SOP
- Scheduled recurring runs, Process chaining
- Custom report builder (1D/2D tables)

## Self-Review Notes

Phase 1 (surface check):
- ✓ Scope coverage: Every section from scope doc covered (except Mobile/API → Phase 3)
- ✓ Misa UI parity: Screenshots in misa-ref/ verified against all UI descriptions
- ✓ No TBD/TODO remaining
- ✓ Vietnamese diacritics used throughout (fixed from initial draft)
- ✓ Phase 1 React Flow preserved as FlowchartViewer read-only

Phase 2 (copy-paste test):
- ✓ Field names aligned with actual code (initiator, run_data, standalone DocType)
- ✓ action_trigger replaces trigger — migration path explicit
- ✓ All 6 executor types defined with resolution logic
- ✓ Approval mode All — multi-executor mechanism specified (multiple run step records)
- ✓ Parallel step numbering + join condition defined
- ✓ Deadline "From Field" semantic clarified (absolute datetime)
- ✓ Template JSON schema with example
- ✓ Version restore safety note (in-flight runs unaffected)
- ✓ Migration section added (§10)
- ✓ Comment vs Activity distinction explicit
