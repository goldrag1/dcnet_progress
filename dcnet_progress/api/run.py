# apps/dcnet_progress/dcnet_progress/api/run.py
import json

import frappe
from frappe.utils import now_datetime

from dcnet_progress.engine import (
    _get_run_step,
    _get_run_steps,
    _get_snapshot,
    _log_activity,
    activate_step,
    advance_run,
    handle_reject,
)


@frappe.whitelist(methods=["POST"])
def start(definition, title=None, initial_data=None):
    """Create a new process run from a published definition."""
    defn = frappe.get_doc("Process Definition", definition)
    if defn.status != "Published":
        frappe.throw("Chỉ có thể chạy quy trình đã xuất bản")

    if initial_data and isinstance(initial_data, str):
        initial_data = json.loads(initial_data)

    # Build snapshot from current definition
    snapshot = {
        "steps": [
            {
                "step_id": s.step_id,
                "step_type": s.step_type,
                "label": s.label,
                "description": s.description,
                "form_schema": json.loads(s.form_schema) if s.form_schema else [],
                "executor_type": s.executor_type,
                "executor_value": s.executor_value,
                "allow_reassign": s.allow_reassign,
                "allow_return": s.allow_return,
                "allow_forward": s.allow_forward,
            }
            for s in defn.steps
        ],
        "transitions": [
            {
                "transition_id": t.transition_id,
                "from_step": t.from_step,
                "to_step": t.to_step,
                "trigger": t.trigger,
                "condition_type": t.condition_type,
                "condition_json": json.loads(t.condition_json) if t.condition_json else None,
                "label": t.label,
            }
            for t in defn.transitions
        ],
    }

    run = frappe.new_doc("Process Run")
    run.definition = defn.name
    run.title = title or defn.title
    run.initiator = frappe.session.user
    run.status = "Running"
    run.started_at = now_datetime()
    run.run_data = json.dumps(snapshot)
    run.insert(ignore_permissions=True)
    frappe.db.commit()

    # Create Pending steps for every step in the definition
    for step_def in snapshot["steps"]:
        step_doc = frappe.new_doc("Process Run Step")
        step_doc.run = run.name
        step_doc.step_id = step_def["step_id"]
        step_doc.step_type = step_def["step_type"]
        step_doc.label = step_def.get("label", "")
        step_doc.status = "Pending"
        step_doc.insert(ignore_permissions=True)

    # Find Start node and mark it Completed so advance_run can proceed
    start_def = next((s for s in snapshot["steps"] if s["step_type"] == "Start"), None)
    if start_def:
        rows = frappe.get_all(
            "Process Run Step",
            filters={"run": run.name, "step_id": start_def["step_id"]},
            fields=["name"],
        )
        if rows:
            step_doc = frappe.get_doc("Process Run Step", rows[0].name)
            step_doc.status = "Completed"
            step_doc.assigned_to = frappe.session.user
            step_doc.completed_at = now_datetime()
            if initial_data:
                step_doc.form_data = json.dumps(initial_data)
            step_doc.save(ignore_permissions=True)

    frappe.db.commit()

    # Advance from Start → activate next steps
    advance_run(run.name)

    return {"name": run.name, "status": run.status}


@frappe.whitelist(methods=["POST"])
def execute_step(run, step, action, data=None, comment=None, step_id=None):
    """Execute an action on an active step.

    step: Process Run Step doc name (e.g. "PRST-0001")
    action: Complete | Reject | Comment | Approve | Forward | Return
    """
    run_doc = frappe.get_doc("Process Run", run)

    if run_doc.status != "Running":
        frappe.throw("Lượt chạy không ở trạng thái đang thực hiện")

    # Resolve step: accept either doc name (step) or step_id UUID
    if step:
        step_doc = frappe.get_doc("Process Run Step", step)
        if step_doc.run != run:
            frappe.throw("Bước không thuộc lượt chạy này")
        step_id = step_doc.step_id
    else:
        step_doc_name = _get_run_step(run, step_id)
        if not step_doc_name:
            frappe.throw(f"Không tìm thấy bước {step_id}")
        step_doc = frappe.get_doc("Process Run Step", step_doc_name.name)

    if step_doc.status != "Active" and action not in ("Comment",):
        frappe.throw("Bước này không ở trạng thái hoạt động")

    if data and isinstance(data, str):
        data = json.loads(data)

    # Normalize "Complete"/"Approve" → complete path
    if action in ("Complete", "Approve", "Forward", "Return"):
        step_doc.status = "Completed"
        step_doc.completed_at = now_datetime()
        if data:
            step_doc.form_data = json.dumps(data)
        step_doc.save(ignore_permissions=True)

        _log_activity(run, step_doc.name, "Complete", comment or "")

        frappe.db.commit()
        advance_run(run)

    elif action == "Reject":
        step_doc.status = "Rejected"
        step_doc.completed_at = now_datetime()
        if data:
            step_doc.form_data = json.dumps(data)
        step_doc.save(ignore_permissions=True)

        _log_activity(run, step_doc.name, "Reject", comment or "")

        frappe.db.commit()
        handle_reject(run, step_id)

    elif action == "Comment":
        _log_activity(run, step_doc.name, "Comment", comment or "")
        frappe.db.commit()

    return {"ok": True, "run": run, "status": frappe.db.get_value("Process Run", run, "status")}


@frappe.whitelist(methods=["POST"])
def withdraw(run):
    """Withdraw a run (initiator only)."""
    run_doc = frappe.get_doc("Process Run", run)

    if run_doc.initiator != frappe.session.user:
        frappe.throw("Chỉ người khởi tạo mới có thể thu hồi")
    if run_doc.status != "Running":
        frappe.throw("Chỉ có thể thu hồi lượt chạy đang thực hiện")

    run_doc.status = "Cancelled"
    run_doc.save(ignore_permissions=True)
    _log_activity(run, None, "Withdraw", "Người khởi tạo thu hồi quy trình")
    frappe.db.commit()
    return {"name": run, "status": "Cancelled"}


@frappe.whitelist(methods=["POST"])
def reassign(run, step_id, new_user):
    """Reassign an active step to a different user."""
    run_step = _get_run_step(run, step_id)
    if not run_step or run_step.status != "Active":
        frappe.throw("Không tìm thấy bước hoạt động để phân công lại")

    step_doc = frappe.get_doc("Process Run Step", run_step.name)
    step_doc.assigned_to = new_user
    step_doc.save(ignore_permissions=True)

    _log_activity(run, run_step.name, "Reassign", f"Phân công lại cho {new_user}")
    frappe.db.commit()
    return {"name": run, "assigned_to": new_user}


@frappe.whitelist()
def get_detail(run):
    """Get full run detail with steps and activities."""
    run_doc = frappe.get_doc("Process Run", run)
    snapshot = _get_snapshot(run_doc)

    def_title = frappe.db.get_value("Process Definition", run_doc.definition, "title") or ""
    steps = _get_run_steps(run)

    # Build step_def lookup from snapshot for form_schema
    step_defs = {s["step_id"]: s for s in snapshot.get("steps", [])}

    activities = frappe.get_all(
        "Process Run Activity",
        filters={"run": run},
        fields=["name", "run_step", "actor", "action", "comment", "timestamp"],
        order_by="timestamp asc",
    )

    return {
        "run": {
            "name": run_doc.name,
            "definition": run_doc.definition,
            "definition_title": def_title,
            "title": run_doc.title,
            "status": run_doc.status,
            "initiator": run_doc.initiator,
            "started_at": str(run_doc.started_at) if run_doc.started_at else None,
            "completed_at": str(run_doc.completed_at) if run_doc.completed_at else None,
        },
        "steps": [
            {
                "name": s.name,
                "run": run_doc.name,
                "step_id": s.step_id,
                "step_type": s.step_type,
                "label": s.label,
                "status": s.status,
                "assigned_to": s.assigned_to,
                "form_schema": step_defs.get(s.step_id, {}).get("form_schema") or [],
                "form_data": json.loads(s.form_data) if s.form_data else None,
                "started_at": str(s.started_at) if s.started_at else None,
                "completed_at": str(s.completed_at) if s.completed_at else None,
            }
            for s in steps
        ],
        "activities": [
            {
                "name": a.name,
                "run": run_doc.name,
                "run_step": a.run_step,
                "actor": a.actor,
                "action": a.action,
                "comment": a.comment,
                "timestamp": str(a.timestamp) if a.timestamp else None,
            }
            for a in activities
        ],
    }


@frappe.whitelist()
def get_my_tasks(page=1, page_size=20):
    """Get active steps assigned to the current user."""
    page = int(page)
    page_size = int(page_size)
    start = (page - 1) * page_size

    steps = frappe.db.sql(
        """
        SELECT
            s.name, s.run, s.step_id, s.label, s.step_type, s.assigned_to, s.started_at
        FROM `tabProcess Run Step` s
        WHERE s.assigned_to = %s AND s.status = 'Active'
        ORDER BY s.started_at DESC
        LIMIT %s OFFSET %s
        """,
        (frappe.session.user, page_size, start),
        as_dict=True,
    )

    for step in steps:
        run_data = frappe.db.get_value(
            "Process Run",
            step["run"],
            ["definition", "initiator", "status", "title"],
            as_dict=True,
        )
        if run_data:
            step["definition"] = run_data["definition"]
            step["definition_title"] = frappe.db.get_value(
                "Process Definition", run_data["definition"], "title"
            ) or ""
            step["initiator"] = run_data["initiator"]
            step["run_title"] = run_data["title"]

    total = frappe.db.count(
        "Process Run Step",
        filters={"assigned_to": frappe.session.user, "status": "Active"},
    )

    return {"data": steps, "total": total, "page": page, "page_size": page_size}


@frappe.whitelist()
def get_list(page=1, page_size=20, status=None):
    """List process runs with pagination."""
    page = int(page)
    page_size = int(page_size)
    start = (page - 1) * page_size

    filters = {}
    if status:
        filters["status"] = status

    runs = frappe.get_all(
        "Process Run",
        filters=filters,
        fields=["name", "title", "definition", "initiator", "status", "started_at", "completed_at"],
        order_by="started_at desc",
        start=start,
        page_length=page_size,
    )

    # Enrich with definition title
    for r in runs:
        r["definition_title"] = frappe.db.get_value("Process Definition", r["definition"], "title") or ""

    total = frappe.db.count("Process Run", filters)
    return {"data": runs, "total": total, "page": page, "page_size": page_size}
