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
    handle_return,
    handle_forward,
    is_step_group_complete,
)


@frappe.whitelist(methods=["POST"])
def start(definition, title=None, initial_data=None):
    """Create a new process run from a published definition."""
    defn = frappe.get_doc("Process Definition", definition)
    if defn.status != "Published":
        frappe.throw("Chỉ có thể chạy quy trình đã xuất bản")

    from dcnet_progress.permissions import has_process_definition_start_permission
    if not has_process_definition_start_permission(definition):
        frappe.throw("Bạn không có quyền chạy quy trình này")

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
                "step_order": s.step_order or s.idx,
                "form_schema": json.loads(s.form_schema) if s.form_schema else [],
                "executor_type": s.executor_type,
                "executor_value": s.executor_value,
                "approval_mode": s.approval_mode or "Any",
                "allow_reassign": s.allow_reassign,
                "allow_return": s.allow_return,
                "allow_forward": s.allow_forward,
                "no_return": s.no_return,
                "deadline_type": s.deadline_type or "",
                "deadline_duration": s.deadline_duration or 0,
                "deadline_field_step": s.deadline_field_step or "",
                "deadline_field_name": s.deadline_field_name or "",
            }
            for s in defn.steps
        ],
        "transitions": [
            {
                "transition_id": t.transition_id,
                "from_step": t.from_step,
                "to_step": t.to_step,
                "trigger": t.trigger,
                "action_trigger": t.action_trigger or "Send",
                "condition_type": t.condition_type,
                "condition_json": json.loads(t.condition_json) if t.condition_json else None,
                "label": t.label,
                "target_mode": t.target_mode or "Next Step",
                "target_step_id": t.target_step_id or "",
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

    # Find Start node and mark it Completed
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
    advance_run(run.name)
    return {"name": run.name, "status": run.status}


@frappe.whitelist(methods=["POST"])
def execute_step(run, step=None, action="Complete", form_data=None, comment=None, step_id=None, target_step_id=None, new_user=None):
    """Execute an action on an active step.

    action: Complete | Reject | Comment | Approve | Forward | Return
    """
    run_doc = frappe.get_doc("Process Run", run)

    if run_doc.status != "Running":
        frappe.throw("Lượt chạy không ở trạng thái đang thực hiện")

    # Resolve step
    if step:
        step_doc = frappe.get_doc("Process Run Step", step)
        if step_doc.run != run:
            frappe.throw("Bước không thuộc lượt chạy này")
        step_id = step_doc.step_id
    else:
        step_row = _get_run_step(run, step_id)
        if not step_row:
            frappe.throw(f"Không tìm thấy bước {step_id}")
        step_doc = frappe.get_doc("Process Run Step", step_row.name)

    if step_doc.status != "Active" and action not in ("Comment",):
        frappe.throw("Bước này không ở trạng thái hoạt động")

    if form_data and isinstance(form_data, str):
        form_data = json.loads(form_data)

    if action in ("Complete", "Approve", "Send"):
        step_doc.status = "Completed"
        step_doc.completed_at = now_datetime()
        if form_data:
            step_doc.form_data = json.dumps(form_data)
        step_doc.save(ignore_permissions=True)
        _log_activity(run, step_doc.name, "Complete", comment or "")
        frappe.db.commit()

        # For All mode: check if all records for this step_id are done
        snapshot = _get_snapshot(run_doc)
        from dcnet_progress.engine import _get_step_def
        sdef = _get_step_def(snapshot, step_id)
        if sdef and sdef.get("approval_mode") == "All":
            if not is_step_group_complete(run, step_id):
                return {"ok": True, "run": run, "status": "Running"}

        advance_run(run)

    elif action == "Reject":
        step_doc.status = "Rejected"
        step_doc.completed_at = now_datetime()
        if form_data:
            step_doc.form_data = json.dumps(form_data)
        step_doc.save(ignore_permissions=True)
        _log_activity(run, step_doc.name, "Reject", comment or "")
        frappe.db.commit()
        handle_reject(run, step_id)

    elif action == "Forward":
        if not new_user:
            frappe.throw("Cần chỉ định người nhận chuyển tiếp")
        handle_forward(run, step_id, new_user)

    elif action == "Return":
        if not target_step_id:
            frappe.throw("Cần chỉ định bước trả về")
        handle_return(run, step_id, target_step_id)

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
    """Get full run detail with steps, activities, and comments."""
    run_doc = frappe.get_doc("Process Run", run)
    snapshot = _get_snapshot(run_doc)
    def_title = frappe.db.get_value("Process Definition", run_doc.definition, "title") or ""
    steps = _get_run_steps(run)
    step_defs = {s["step_id"]: s for s in snapshot.get("steps", [])}

    activities = frappe.get_all(
        "Process Run Activity",
        filters={"run": run},
        fields=["name", "run_step", "actor", "action", "comment", "timestamp"],
        order_by="timestamp asc",
    )

    comments = frappe.get_all(
        "Process Run Comment",
        filters={"run": run},
        fields=["name", "step_id", "user", "content", "mentions", "attachments", "creation"],
        order_by="creation asc",
    )

    return {
        "run": {
            "name": run_doc.name,
            "definition": run_doc.definition,
            "definition_title": def_title,
            "title": run_doc.title,
            "status": run_doc.status,
            "is_draft": run_doc.is_draft,
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
                "allow_return": step_defs.get(s.step_id, {}).get("allow_return", 0),
                "allow_forward": step_defs.get(s.step_id, {}).get("allow_forward", 0),
                "allow_reassign": step_defs.get(s.step_id, {}).get("allow_reassign", 0),
                "no_return": step_defs.get(s.step_id, {}).get("no_return", 0),
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
        "comments": [
            {
                "name": c.name,
                "step_id": c.step_id,
                "user": c.user,
                "content": c.content,
                "mentions": json.loads(c.mentions) if c.mentions else [],
                "attachments": json.loads(c.attachments) if c.attachments else [],
                "creation": str(c.creation) if c.creation else None,
            }
            for c in comments
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
        SELECT s.name, s.run, s.step_id, s.label, s.step_type, s.assigned_to, s.started_at
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
            "Process Run", step["run"],
            ["definition", "initiator", "status", "title"], as_dict=True,
        )
        if run_data:
            step["definition"] = run_data["definition"]
            step["definition_title"] = frappe.db.get_value("Process Definition", run_data["definition"], "title") or ""
            step["initiator"] = run_data["initiator"]
            step["run_title"] = run_data["title"]

    total = frappe.db.count("Process Run Step", filters={"assigned_to": frappe.session.user, "status": "Active"})
    return {"data": steps, "total": total, "page": page, "page_size": page_size}


@frappe.whitelist()
def get_list(page=1, page_size=20, status=None, is_draft=None):
    """List process runs with pagination."""
    page = int(page)
    page_size = int(page_size)
    start = (page - 1) * page_size
    filters = {}
    if status:
        filters["status"] = status
    if is_draft is not None:
        filters["is_draft"] = int(is_draft)
    runs = frappe.get_all(
        "Process Run", filters=filters,
        fields=["name", "title", "definition", "initiator", "status", "started_at", "completed_at"],
        order_by="started_at desc", start=start, page_length=page_size,
    )
    for r in runs:
        r["definition_title"] = frappe.db.get_value("Process Definition", r["definition"], "title") or ""
    total = frappe.db.count("Process Run", filters)
    return {"data": runs, "total": total, "page": page, "page_size": page_size}


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@frappe.whitelist(methods=["POST"])
def add_comment(run, content, step_id=None, mentions=None):
    """Add a comment to a run."""
    doc = frappe.new_doc("Process Run Comment")
    doc.run = run
    doc.step_id = step_id
    doc.user = frappe.session.user
    doc.content = content
    if mentions:
        doc.mentions = json.dumps(mentions) if isinstance(mentions, list) else mentions
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"name": doc.name, "user": doc.user, "content": doc.content, "creation": str(doc.creation)}


@frappe.whitelist()
def get_comments(run):
    """Get all comments for a run."""
    comments = frappe.get_all(
        "Process Run Comment",
        filters={"run": run},
        fields=["name", "step_id", "user", "content", "mentions", "attachments", "creation"],
        order_by="creation asc",
    )
    return [{
        "name": c.name, "step_id": c.step_id, "user": c.user, "content": c.content,
        "mentions": json.loads(c.mentions) if c.mentions else [],
        "attachments": json.loads(c.attachments) if c.attachments else [],
        "creation": str(c.creation) if c.creation else None,
    } for c in comments]


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------

@frappe.whitelist(methods=["POST"])
def toggle_favorite(definition):
    """Toggle favorite for current user."""
    existing = frappe.db.exists("Process Favorite", {"user": frappe.session.user, "definition": definition})
    if existing:
        frappe.delete_doc("Process Favorite", existing, ignore_permissions=True)
        frappe.db.commit()
        return {"is_favorite": False}
    else:
        doc = frappe.new_doc("Process Favorite")
        doc.user = frappe.session.user
        doc.definition = definition
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return {"is_favorite": True}


@frappe.whitelist()
def get_favorites():
    """Get all favorites for current user."""
    favs = frappe.get_all(
        "Process Favorite",
        filters={"user": frappe.session.user},
        pluck="definition",
    )
    return favs


# ---------------------------------------------------------------------------
# Saved Filters
# ---------------------------------------------------------------------------

@frappe.whitelist(methods=["POST"])
def save_filter(filter_name, filter_json, share_scope="Private"):
    """Save a named filter."""
    if isinstance(filter_json, str):
        json.loads(filter_json)  # validate JSON
    doc = frappe.new_doc("Process Saved Filter")
    doc.user = frappe.session.user
    doc.filter_name = filter_name
    doc.filter_json = filter_json if isinstance(filter_json, str) else json.dumps(filter_json)
    doc.share_scope = share_scope
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"name": doc.name, "filter_name": doc.filter_name}


@frappe.whitelist()
def get_filters():
    """Get saved filters visible to current user."""
    user = frappe.session.user
    filters = frappe.db.sql("""
        SELECT name, filter_name, filter_json, share_scope, user
        FROM `tabProcess Saved Filter`
        WHERE user = %s OR share_scope = 'All'
        ORDER BY creation DESC
    """, (user,), as_dict=True)

    return [{
        "name": f.name, "filter_name": f.filter_name,
        "filter_json": json.loads(f.filter_json) if f.filter_json else {},
        "share_scope": f.share_scope, "user": f.user,
    } for f in filters]


@frappe.whitelist(methods=["POST"])
def delete_filter(name):
    """Delete a saved filter (owner only)."""
    doc = frappe.get_doc("Process Saved Filter", name)
    if doc.user != frappe.session.user and "System Manager" not in frappe.get_roles():
        frappe.throw("Chỉ người tạo mới có thể xóa bộ lọc này")
    frappe.delete_doc("Process Saved Filter", name, ignore_permissions=True)
    frappe.db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Drafts
# ---------------------------------------------------------------------------

@frappe.whitelist(methods=["POST"])
def save_draft(definition, title=None, initial_data=None):
    """Save a run as draft (not yet started)."""
    if initial_data and isinstance(initial_data, str):
        initial_data = json.loads(initial_data)

    run = frappe.new_doc("Process Run")
    run.definition = definition
    run.title = title or "Nháp"
    run.initiator = frappe.session.user
    run.status = "Draft"
    run.is_draft = 1
    if initial_data:
        run.context_json = json.dumps(initial_data)
    run.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"name": run.name, "status": "Draft"}


@frappe.whitelist(methods=["POST"])
def submit_draft(run):
    """Submit a draft run — starts the process."""
    run_doc = frappe.get_doc("Process Run", run)
    if run_doc.status != "Draft":
        frappe.throw("Chỉ có thể gửi bản nháp")

    initial_data = json.loads(run_doc.context_json) if run_doc.context_json else None
    result = start(run_doc.definition, run_doc.title, json.dumps(initial_data) if initial_data else None)

    # Delete the draft
    frappe.delete_doc("Process Run", run, ignore_permissions=True)
    frappe.db.commit()
    return result


@frappe.whitelist(methods=["POST"])
def duplicate(run):
    """Duplicate a run as a new draft."""
    run_doc = frappe.get_doc("Process Run", run)
    initial_data = json.loads(run_doc.context_json) if run_doc.context_json else None
    return save_draft(run_doc.definition, f"{run_doc.title} (bản sao)", json.dumps(initial_data) if initial_data else None)


@frappe.whitelist(methods=["POST"])
def cancel(run):
    """Cancel a run (admin only)."""
    if "System Manager" not in frappe.get_roles():
        frappe.throw("Chỉ quản trị viên mới có thể hủy")
    run_doc = frappe.get_doc("Process Run", run)
    run_doc.status = "Cancelled"
    run_doc.save(ignore_permissions=True)
    _log_activity(run, None, "Withdraw", "Quản trị viên hủy quy trình")
    frappe.db.commit()
    return {"name": run, "status": "Cancelled"}
