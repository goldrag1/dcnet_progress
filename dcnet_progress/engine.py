# apps/dcnet_progress/dcnet_progress/engine.py
import json

import frappe
from frappe.utils import now_datetime


# ---------------------------------------------------------------------------
# Low-level helpers — all use standalone DocType queries
# ---------------------------------------------------------------------------

def _get_run_steps(run_name):
    """Return all run steps for a run as list of dicts."""
    return frappe.get_all(
        "Process Run Step",
        filters={"run": run_name},
        fields=["name", "step_id", "step_type", "status", "assigned_to", "started_at", "completed_at", "form_data"],
    )


def _get_run_step(run_name, step_id):
    """Return a single run step dict by step_id, or None."""
    rows = frappe.get_all(
        "Process Run Step",
        filters={"run": run_name, "step_id": step_id},
        fields=["name", "step_id", "step_type", "status", "assigned_to", "started_at", "completed_at", "form_data"],
    )
    return rows[0] if rows else None


def _log_activity(run_name, run_step_name, action, comment=""):
    """Insert a Process Run Activity record.

    action must be one of: Start, Complete, Reject, Reassign, Comment, Withdraw
    """
    activity = frappe.new_doc("Process Run Activity")
    activity.run = run_name
    activity.run_step = run_step_name
    activity.actor = frappe.session.user
    activity.action = action
    activity.comment = comment
    activity.timestamp = now_datetime()
    activity.insert(ignore_permissions=True)


def _get_snapshot(run_doc):
    """Return the definition snapshot dict stored in run_data."""
    if not run_doc.run_data:
        return {}
    return json.loads(run_doc.run_data) if isinstance(run_doc.run_data, str) else run_doc.run_data


def _get_step_def(snapshot, step_id):
    """Get step definition from snapshot dict by step_id."""
    for s in snapshot.get("steps", []):
        if s["step_id"] == step_id:
            return s
    return None


def _get_accumulated_form_data(run_name):
    """Collect form_data from all completed steps into one merged dict."""
    steps = frappe.get_all(
        "Process Run Step",
        filters={"run": run_name, "status": "Completed"},
        fields=["form_data"],
    )
    data = {}
    for step in steps:
        if step.form_data:
            step_data = json.loads(step.form_data) if isinstance(step.form_data, str) else step.form_data
            if step_data:
                data.update(step_data)
    return data


# ---------------------------------------------------------------------------
# Core engine functions
# ---------------------------------------------------------------------------

def advance_run(run_name):
    """Evaluate transitions from completed steps and activate the next ones."""
    run = frappe.get_doc("Process Run", run_name)
    snapshot = _get_snapshot(run)
    if not snapshot:
        return

    steps = _get_run_steps(run_name)
    completed_steps = [s for s in steps if s.status == "Completed"]

    for completed_step in completed_steps:
        outgoing = [
            t for t in snapshot.get("transitions", [])
            if t["from_step"] == completed_step.step_id and t.get("trigger") == "On Complete"
        ]

        for transition in outgoing:
            if not evaluate_condition(transition, run_name, snapshot):
                continue

            target_step_id = transition["to_step"]
            target_def = _get_step_def(snapshot, target_step_id)
            if not target_def:
                continue

            if target_def["step_type"] == "End":
                if all_predecessors_complete(snapshot, target_step_id, run_name):
                    run.status = "Completed"
                    run.completed_at = now_datetime()
                    run.save(ignore_permissions=True)
                    _log_activity(run_name, None, "Complete", "Quy trình hoàn thành")
            else:
                # Check that this target isn't already Active/Completed (avoid double-activate)
                existing = _get_run_step(run_name, target_step_id)
                if existing and existing.status in ("Active", "Completed"):
                    continue
                if all_predecessors_complete(snapshot, target_step_id, run_name):
                    activate_step(run_name, target_step_id, snapshot, completed_step.assigned_to)

    frappe.db.commit()


def handle_reject(run_name, step_id):
    """Follow On Reject transitions or cancel the run."""
    run = frappe.get_doc("Process Run", run_name)
    snapshot = _get_snapshot(run)

    reject_transitions = [
        t for t in snapshot.get("transitions", [])
        if t["from_step"] == step_id and t.get("trigger") == "On Reject"
    ]

    rejected_step = _get_run_step(run_name, step_id)
    step_name = rejected_step.name if rejected_step else None

    if reject_transitions:
        for transition in reject_transitions:
            if evaluate_condition(transition, run_name, snapshot):
                target_def = _get_step_def(snapshot, transition["to_step"])
                if target_def and target_def["step_type"] != "End":
                    prev_user = rejected_step.assigned_to if rejected_step else None
                    activate_step(run_name, transition["to_step"], snapshot, prev_user)
    else:
        run.status = "Cancelled"
        run.save(ignore_permissions=True)
        _log_activity(run_name, step_name, "Reject", "Quy trình bị hủy do từ chối")

    frappe.db.commit()


def evaluate_condition(transition, run_name, snapshot):
    """Evaluate a transition condition against accumulated form data."""
    condition_type = transition.get("condition_type", "Always")
    if condition_type == "Always":
        return True

    condition_json = transition.get("condition_json")
    if not condition_json:
        return True
    if isinstance(condition_json, str):
        condition_json = json.loads(condition_json)

    form_data = _get_accumulated_form_data(run_name)
    logic = condition_json.get("logic", "AND")
    conditions = condition_json.get("conditions", [])
    results = [_eval_single_condition(c, form_data) for c in conditions]

    return all(results) if logic == "AND" else any(results)


def _eval_single_condition(condition, form_data):
    field = condition.get("field", "")
    op = condition.get("op", "==")
    value = condition.get("value")
    actual = form_data.get(field)

    if actual is None:
        return False

    try:
        if op == "==":
            return actual == value
        elif op == "!=":
            return actual != value
        elif op == ">":
            return float(actual) > float(value)
        elif op == ">=":
            return float(actual) >= float(value)
        elif op == "<":
            return float(actual) < float(value)
        elif op == "<=":
            return float(actual) <= float(value)
        elif op == "in":
            return actual in (value if isinstance(value, list) else [value])
        elif op == "not_in":
            return actual not in (value if isinstance(value, list) else [value])
    except (ValueError, TypeError):
        return False

    return False


def all_predecessors_complete(snapshot, step_id, run_name):
    """Return True if every incoming transition's source step is complete."""
    incoming = [t for t in snapshot.get("transitions", []) if t["to_step"] == step_id]
    if not incoming:
        return True

    for transition in incoming:
        from_step_id = transition["from_step"]
        from_def = _get_step_def(snapshot, from_step_id)
        if from_def and from_def["step_type"] == "Start":
            continue

        run_step = _get_run_step(run_name, from_step_id)
        if not run_step or run_step.status not in ("Completed", "Skipped"):
            return False

    return True


def activate_step(run_name, step_id, snapshot, previous_step_user=None):
    """Activate a step: create or update the Process Run Step doc."""
    existing = _get_run_step(run_name, step_id)
    if existing and existing.status == "Active":
        return

    step_def = _get_step_def(snapshot, step_id)
    if not step_def:
        return

    run = frappe.get_doc("Process Run", run_name)
    executor = resolve_executor(step_def, run, previous_step_user)

    if existing:
        step_doc = frappe.get_doc("Process Run Step", existing.name)
        step_doc.status = "Active"
        step_doc.assigned_to = executor
        step_doc.started_at = now_datetime()
        step_doc.save(ignore_permissions=True)
    else:
        step_doc = frappe.new_doc("Process Run Step")
        step_doc.run = run_name
        step_doc.step_id = step_id
        step_doc.step_type = step_def.get("step_type", "Task")
        step_doc.label = step_def.get("label", "")
        step_doc.status = "Active"
        step_doc.assigned_to = executor
        step_doc.started_at = now_datetime()
        step_doc.insert(ignore_permissions=True)

    _log_activity(run_name, step_doc.name, "Start", f"Giao cho {executor or 'chưa xác định'}")

    from dcnet_progress.notifications import notify_step_activation
    notify_step_activation(run, step_id, executor, step_def)


def resolve_executor(step_def, run, previous_step_user=None):
    """Resolve the executor for a step based on executor_type."""
    executor_type = step_def.get("executor_type", "")
    executor_value = step_def.get("executor_value", "")

    if executor_type == "Initiator":
        return run.initiator
    elif executor_type == "User":
        return executor_value
    elif executor_type == "Role":
        users = frappe.get_all(
            "Has Role",
            filters={"role": executor_value, "parenttype": "User"},
            pluck="parent",
        )
        return users[0] if users else None
    elif executor_type == "Direct Manager":
        reports_to = frappe.db.get_value("Employee", {"user_id": run.initiator}, "reports_to")
        if reports_to:
            return frappe.db.get_value("Employee", reports_to, "user_id")
    elif executor_type == "Previous Step Executor":
        return previous_step_user

    return None
