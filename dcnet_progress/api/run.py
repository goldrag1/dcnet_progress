# apps/dcnet_progress/dcnet_progress/api/run.py
import json

import frappe
from frappe.utils import now_datetime

from dcnet_progress.engine import activate_step, advance_run, handle_reject, resolve_executor


@frappe.whitelist(methods=["POST"])
def start(definition, initial_data=None):
    """Create a new process run from a published definition."""
    defn = frappe.get_doc("Process Definition", definition)
    if defn.status != "Published":
        frappe.throw("Chỉ có thể chạy quy trình đã xuất bản")

    if initial_data and isinstance(initial_data, str):
        initial_data = json.loads(initial_data)

    # Build snapshot
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
    run.process_definition = defn.name
    run.definition_version = defn.version
    run.definition_snapshot = json.dumps(snapshot)
    run.status = "In Progress"
    run.initiated_by = frappe.session.user

    # Create run steps for all steps (Pending)
    for step_def in snapshot["steps"]:
        run.append("run_steps", {
            "step_id": step_def["step_id"],
            "status": "Pending",
        })

    # Find Start node and auto-complete it
    start_step = None
    for step_def in snapshot["steps"]:
        if step_def["step_type"] == "Start":
            start_step = step_def
            break

    if start_step:
        for rs in run.run_steps:
            if rs.step_id == start_step["step_id"]:
                rs.status = "Completed"
                rs.completed_at = now_datetime()
                rs.assigned_to = frappe.session.user
                if initial_data:
                    rs.form_data = json.dumps(initial_data)
                break

    run.insert(ignore_permissions=True)
    frappe.db.commit()

    # Advance from Start to activate next steps
    advance_run(run.name)

    return {"name": run.name, "status": run.status}


@frappe.whitelist(methods=["POST"])
def execute_step(run, step_id, action, data=None, comment=None):
    """Execute an action on an active step."""
    run_doc = frappe.get_doc("Process Run", run)

    if run_doc.status != "In Progress":
        frappe.throw("Lượt chạy không ở trạng thái đang thực hiện")

    run_step = None
    for rs in run_doc.run_steps:
        if rs.step_id == step_id:
            run_step = rs
            break

    if not run_step:
        frappe.throw(f"Không tìm thấy bước {step_id}")

    if run_step.status != "Active":
        frappe.throw("Bước này không ở trạng thái hoạt động")

    if data and isinstance(data, str):
        data = json.loads(data)

    if action in ("Approve", "Forward", "Return"):
        run_step.status = "Completed"
        run_step.action = action
        run_step.action_comment = comment or ""
        run_step.completed_at = now_datetime()
        if data:
            run_step.form_data = json.dumps(data)

        from dcnet_progress.engine import _log_activity
        _log_activity(run_doc, step_id, action.lower(), comment or "")

        run_doc.save(ignore_permissions=True)
        frappe.db.commit()
        advance_run(run_doc.name)

    elif action == "Reject":
        run_step.status = "Rejected"
        run_step.action = "Reject"
        run_step.action_comment = comment or ""
        run_step.completed_at = now_datetime()
        if data:
            run_step.form_data = json.dumps(data)

        from dcnet_progress.engine import _log_activity
        _log_activity(run_doc, step_id, "reject", comment or "")

        run_doc.save(ignore_permissions=True)
        frappe.db.commit()
        handle_reject(run_doc.name, step_id)

    return {"name": run_doc.name, "status": frappe.db.get_value("Process Run", run_doc.name, "status")}


@frappe.whitelist(methods=["POST"])
def withdraw(run):
    """Withdraw a run (initiator only)."""
    run_doc = frappe.get_doc("Process Run", run)

    if run_doc.initiated_by != frappe.session.user:
        frappe.throw("Chỉ người khởi tạo mới có thể thu hồi")

    if run_doc.status != "In Progress":
        frappe.throw("Chỉ có thể thu hồi lượt chạy đang thực hiện")

    run_doc.status = "Withdrawn"
    run_doc.save(ignore_permissions=True)
    return {"name": run_doc.name, "status": "Withdrawn"}


@frappe.whitelist(methods=["POST"])
def reassign(run, step_id, new_user):
    """Reassign an active step to a different user."""
    run_doc = frappe.get_doc("Process Run", run)

    for rs in run_doc.run_steps:
        if rs.step_id == step_id and rs.status == "Active":
            rs.assigned_to = new_user
            from dcnet_progress.engine import _log_activity
            _log_activity(run_doc, step_id, "reassign", f"Phân công lại cho {new_user}")
            run_doc.save(ignore_permissions=True)
            return {"name": run_doc.name, "assigned_to": new_user}

    frappe.throw("Không tìm thấy bước hoạt động để phân công lại")


@frappe.whitelist()
def get_detail(run):
    """Get full run detail with steps and activities."""
    run_doc = frappe.get_doc("Process Run", run)
    snapshot = json.loads(run_doc.definition_snapshot) if isinstance(run_doc.definition_snapshot, str) else run_doc.definition_snapshot

    def_title = frappe.db.get_value("Process Definition", run_doc.process_definition, "title") or ""

    return {
        "name": run_doc.name,
        "process_definition": run_doc.process_definition,
        "definition_title": def_title,
        "definition_version": run_doc.definition_version,
        "status": run_doc.status,
        "initiated_by": run_doc.initiated_by,
        "completed_at": str(run_doc.completed_at) if run_doc.completed_at else None,
        "created": str(run_doc.creation),
        "snapshot": snapshot,
        "run_steps": [
            {
                "step_id": s.step_id,
                "status": s.status,
                "assigned_to": s.assigned_to,
                "form_data": json.loads(s.form_data) if s.form_data else None,
                "action": s.action,
                "action_comment": s.action_comment,
                "activated_at": str(s.activated_at) if s.activated_at else None,
                "completed_at": str(s.completed_at) if s.completed_at else None,
            }
            for s in run_doc.run_steps
        ],
        "activities": [
            {
                "step_id": a.step_id,
                "user": a.user,
                "action": a.action,
                "comment": a.comment,
                "from_status": a.from_status,
                "to_status": a.to_status,
                "created": str(a.creation),
            }
            for a in run_doc.activities
        ],
    }


@frappe.whitelist()
def get_my_tasks(page=1, page_size=20):
    """Get active steps assigned to the current user."""
    page = int(page)
    page_size = int(page_size)
    start = (page - 1) * page_size

    steps = frappe.get_all(
        "Process Run Step",
        filters={
            "assigned_to": frappe.session.user,
            "status": "Active",
        },
        fields=["name", "parent", "step_id", "assigned_to", "activated_at"],
        order_by="activated_at desc",
        start=start,
        page_length=page_size,
    )

    # Enrich with run and definition info
    for step in steps:
        run_data = frappe.db.get_value(
            "Process Run",
            step["parent"],
            ["process_definition", "initiated_by", "status"],
            as_dict=True,
        )
        if run_data:
            step["run_name"] = step["parent"]
            step["process_definition"] = run_data["process_definition"]
            step["definition_title"] = frappe.db.get_value(
                "Process Definition", run_data["process_definition"], "title"
            ) or ""
            step["initiated_by"] = run_data["initiated_by"]

        # Get step label from snapshot
        snapshot_json = frappe.db.get_value("Process Run", step["parent"], "definition_snapshot")
        if snapshot_json:
            snapshot = json.loads(snapshot_json) if isinstance(snapshot_json, str) else snapshot_json
            for s_def in snapshot.get("steps", []):
                if s_def["step_id"] == step["step_id"]:
                    step["step_label"] = s_def.get("label", step["step_id"])
                    break

    total = frappe.db.count(
        "Process Run Step",
        filters={"assigned_to": frappe.session.user, "status": "Active"},
    )

    return {"data": steps, "total": total, "page": page, "page_size": page_size}
