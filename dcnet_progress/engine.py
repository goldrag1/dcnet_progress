# apps/dcnet_progress/dcnet_progress/engine.py
import json

import frappe
from frappe.utils import now_datetime


def advance_run(run_name):
    """Evaluate transitions from completed steps and activate next steps."""
    run = frappe.get_doc("Process Run", run_name)
    snapshot = json.loads(run.definition_snapshot) if isinstance(run.definition_snapshot, str) else run.definition_snapshot

    completed_steps = [s for s in run.run_steps if s.status == "Completed" and not s.processed]

    for completed_step in completed_steps:
        outgoing = [
            t for t in snapshot["transitions"]
            if t["from_step"] == completed_step.step_id and t["trigger"] == "On Complete"
        ]

        for transition in outgoing:
            if evaluate_condition(transition, run):
                target_step_id = transition["to_step"]
                target_def = _get_step_def(snapshot, target_step_id)

                if not target_def:
                    continue

                if target_def["step_type"] == "End":
                    if all_predecessors_complete(snapshot, target_step_id, run):
                        run.status = "Completed"
                        run.completed_at = now_datetime()
                        _log_activity(run, target_step_id, "complete", "Quy trình hoàn thành")
                else:
                    if all_predecessors_complete(snapshot, target_step_id, run):
                        previous_user = completed_step.assigned_to
                        activate_step(run, target_step_id, previous_user)

        completed_step.processed = 1

    run.save(ignore_permissions=True)
    frappe.db.commit()


def handle_reject(run_name, step_id):
    """Handle rejection: follow On Reject transitions or cancel the run."""
    run = frappe.get_doc("Process Run", run_name)
    snapshot = json.loads(run.definition_snapshot) if isinstance(run.definition_snapshot, str) else run.definition_snapshot

    reject_transitions = [
        t for t in snapshot["transitions"]
        if t["from_step"] == step_id and t["trigger"] == "On Reject"
    ]

    if reject_transitions:
        for transition in reject_transitions:
            if evaluate_condition(transition, run):
                target_def = _get_step_def(snapshot, transition["to_step"])
                if target_def and target_def["step_type"] != "End":
                    rejected_step = _get_run_step(run, step_id)
                    activate_step(run, transition["to_step"], rejected_step.assigned_to if rejected_step else None)
    else:
        run.status = "Cancelled"
        _log_activity(run, step_id, "cancel", "Quy trình bị hủy do từ chối")

    run.save(ignore_permissions=True)
    frappe.db.commit()


def evaluate_condition(transition, run):
    """Evaluate transition condition against accumulated form_data."""
    condition_type = transition.get("condition_type", "Always")
    if condition_type == "Always":
        return True

    condition_json = transition.get("condition_json")
    if not condition_json:
        return True

    if isinstance(condition_json, str):
        condition_json = json.loads(condition_json)

    form_data = _get_accumulated_form_data(run)

    logic = condition_json.get("logic", "AND")
    conditions = condition_json.get("conditions", [])

    results = [_eval_single_condition(c, form_data) for c in conditions]

    if logic == "AND":
        return all(results)
    else:
        return any(results)


def _eval_single_condition(condition, form_data):
    """Evaluate a single field condition."""
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


def all_predecessors_complete(snapshot, step_id, run):
    """Check if all predecessor steps (incoming edges) are complete."""
    incoming = [t for t in snapshot["transitions"] if t["to_step"] == step_id]
    if not incoming:
        return True

    for transition in incoming:
        from_step_id = transition["from_step"]
        from_def = _get_step_def(snapshot, from_step_id)
        if from_def and from_def["step_type"] == "Start":
            continue

        run_step = _get_run_step(run, from_step_id)
        if not run_step or run_step.status not in ("Completed", "Skipped"):
            return False

    return True


def activate_step(run, step_id, previous_step_user=None):
    """Activate a step: resolve executor, set Active, create activity log."""
    existing = _get_run_step(run, step_id)
    if existing and existing.status == "Active":
        return

    snapshot = json.loads(run.definition_snapshot) if isinstance(run.definition_snapshot, str) else run.definition_snapshot
    step_def = _get_step_def(snapshot, step_id)
    if not step_def:
        return

    executor = resolve_executor(step_def, run, previous_step_user)

    if existing:
        existing.status = "Active"
        existing.assigned_to = executor
        existing.activated_at = now_datetime()
    else:
        run.append("run_steps", {
            "step_id": step_id,
            "status": "Active",
            "assigned_to": executor,
            "activated_at": now_datetime(),
        })

    _log_activity(run, step_id, "activate", f"Giao cho {executor or 'chưa xác định'}")

    # Send notification
    from dcnet_progress.notifications import notify_step_activation
    notify_step_activation(run, step_id, executor, step_def)


def resolve_executor(step_def, run, previous_step_user=None):
    """Resolve who should execute a step based on executor_type."""
    executor_type = step_def.get("executor_type", "")
    executor_value = step_def.get("executor_value", "")

    if executor_type == "Initiator":
        return run.initiated_by
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
        employee = frappe.db.get_value("Employee", {"user_id": run.initiated_by}, "reports_to")
        if employee:
            return frappe.db.get_value("Employee", employee, "user_id")
    elif executor_type == "Previous Step Executor":
        return previous_step_user

    return None


def _get_step_def(snapshot, step_id):
    """Get step definition from snapshot by step_id."""
    for s in snapshot.get("steps", []):
        if s["step_id"] == step_id:
            return s
    return None


def _get_run_step(run, step_id):
    """Get run step by step_id."""
    for s in run.run_steps:
        if s.step_id == step_id:
            return s
    return None


def _get_accumulated_form_data(run):
    """Collect form_data from all completed steps."""
    data = {}
    for step in run.run_steps:
        if step.status == "Completed" and step.form_data:
            step_data = json.loads(step.form_data) if isinstance(step.form_data, str) else step.form_data
            if step_data:
                data.update(step_data)
    return data


def _log_activity(run, step_id, action, comment=""):
    """Add activity log entry."""
    run.append("activities", {
        "step_id": step_id,
        "user": frappe.session.user,
        "action": action,
        "comment": comment,
    })
