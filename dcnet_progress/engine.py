# apps/dcnet_progress/dcnet_progress/engine.py
import json

import frappe
from frappe.utils import now_datetime, add_to_date, get_datetime


# ---------------------------------------------------------------------------
# Low-level helpers — all use standalone DocType queries
# ---------------------------------------------------------------------------

def _get_run_steps(run_name):
    """Return all run steps for a run as list of dicts."""
    return frappe.get_all(
        "Process Run Step",
        filters={"run": run_name},
        fields=["name", "step_id", "step_type", "label", "status", "assigned_to", "started_at", "completed_at", "form_data"],
    )


def _get_run_step(run_name, step_id):
    """Return a single run step dict by step_id, or None."""
    rows = frappe.get_all(
        "Process Run Step",
        filters={"run": run_name, "step_id": step_id},
        fields=["name", "step_id", "step_type", "label", "status", "assigned_to", "started_at", "completed_at", "form_data"],
    )
    return rows[0] if rows else None


def _get_run_steps_for_step_id(run_name, step_id):
    """Return ALL run step records for a step_id (multi-executor may have multiple)."""
    return frappe.get_all(
        "Process Run Step",
        filters={"run": run_name, "step_id": step_id},
        fields=["name", "step_id", "step_type", "label", "status", "assigned_to", "started_at", "completed_at", "form_data"],
    )


def _log_activity(run_name, run_step_name, action, comment=""):
    """Insert a Process Run Activity record."""
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


def _get_steps_by_order(snapshot):
    """Return steps sorted by step_order."""
    steps = snapshot.get("steps", [])
    return sorted(steps, key=lambda s: s.get("step_order", 0))


def _get_next_step_by_order(snapshot, current_step_id):
    """Get the next step after current_step_id by step_order."""
    ordered = _get_steps_by_order(snapshot)
    for i, s in enumerate(ordered):
        if s["step_id"] == current_step_id and i + 1 < len(ordered):
            return ordered[i + 1]
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
# Core engine functions — Phase 2: step-order-based
# ---------------------------------------------------------------------------

def advance_run(run_name):
    """Step-order-based advancement: check branching rules, then advance sequentially."""
    run = frappe.get_doc("Process Run", run_name)
    snapshot = _get_snapshot(run)
    if not snapshot:
        return

    steps = _get_run_steps(run_name)
    completed_step_ids = {s.step_id for s in steps if s.status == "Completed"}

    # Find last completed step (by step_order)
    ordered_steps = _get_steps_by_order(snapshot)
    last_completed = None
    for s in reversed(ordered_steps):
        if s["step_id"] in completed_step_ids:
            last_completed = s
            break

    if not last_completed:
        return

    last_completed_run_step = _get_run_step(run_name, last_completed["step_id"])
    previous_user = last_completed_run_step.assigned_to if last_completed_run_step else None

    # Check branching rules (transitions with conditions)
    transitions = snapshot.get("transitions", [])
    outgoing = [
        t for t in transitions
        if t["from_step"] == last_completed["step_id"]
        and t.get("action_trigger", t.get("trigger", "Send")) in ("Send", "Approve", "On Complete")
    ]

    # Evaluate branching: if a conditional transition matches, follow it
    target_step = None
    for transition in outgoing:
        if evaluate_condition(transition, run_name, snapshot):
            target_mode = transition.get("target_mode", "Next Step")
            if target_mode == "Skip To" and transition.get("target_step_id"):
                target_step = _get_step_def(snapshot, transition["target_step_id"])
            elif target_mode == "Return To" and transition.get("target_step_id"):
                target_step = _get_step_def(snapshot, transition["target_step_id"])
            elif transition.get("to_step"):
                target_step = _get_step_def(snapshot, transition["to_step"])
            if target_step:
                break

    # If no branching rule matched, advance to next step by order
    if not target_step:
        target_step = _get_next_step_by_order(snapshot, last_completed["step_id"])

    if not target_step:
        # No more steps — run complete
        run.status = "Completed"
        run.completed_at = now_datetime()
        run.save(ignore_permissions=True)
        _log_activity(run_name, None, "Complete", "Quy trình hoàn thành")
        frappe.db.commit()
        return

    if target_step["step_type"] == "End":
        run.status = "Completed"
        run.completed_at = now_datetime()
        run.save(ignore_permissions=True)
        _log_activity(run_name, None, "Complete", "Quy trình hoàn thành")
        frappe.db.commit()
        return

    # Check if target is already active/completed
    existing = _get_run_step(run_name, target_step["step_id"])
    if existing and existing.status in ("Active", "Completed"):
        frappe.db.commit()
        return

    # Activate target step (handles multi-executor via approval_mode)
    activate_step_or_group(run_name, target_step["step_id"], snapshot, previous_user)
    frappe.db.commit()


def handle_reject(run_name, step_id):
    """Follow Reject transitions or cancel the run."""
    run = frappe.get_doc("Process Run", run_name)
    snapshot = _get_snapshot(run)

    reject_transitions = [
        t for t in snapshot.get("transitions", [])
        if t["from_step"] == step_id
        and t.get("action_trigger", t.get("trigger", "")) in ("Reject", "On Reject")
    ]

    rejected_step = _get_run_step(run_name, step_id)
    step_name = rejected_step.name if rejected_step else None

    if reject_transitions:
        for transition in reject_transitions:
            if evaluate_condition(transition, run_name, snapshot):
                target_def = _get_step_def(snapshot, transition["to_step"])
                if target_def and target_def["step_type"] != "End":
                    prev_user = rejected_step.assigned_to if rejected_step else None
                    activate_step_or_group(run_name, transition["to_step"], snapshot, prev_user)
    else:
        run.status = "Rejected"
        run.completed_at = now_datetime()
        run.save(ignore_permissions=True)
        _log_activity(run_name, step_name, "Reject", "Quy trình bị từ chối")

    frappe.db.commit()


def handle_return(run_name, step_id, target_step_id):
    """Return to a previous step. Checks no_return flag."""
    snapshot = _get_snapshot(frappe.get_doc("Process Run", run_name))
    target_def = _get_step_def(snapshot, target_step_id)

    if not target_def:
        frappe.throw(f"Bước đích {target_step_id} không tồn tại")

    if target_def.get("no_return"):
        frappe.throw(f"Bước '{target_def.get('label', target_step_id)}' không cho phép trả về")

    # Mark current step as returned
    current = _get_run_step(run_name, step_id)
    if current:
        frappe.db.set_value("Process Run Step", current.name, {
            "status": "Completed",
            "completed_at": now_datetime(),
        }, update_modified=False)
        _log_activity(run_name, current.name, "Complete", f"Trả về bước {target_def.get('label', target_step_id)}")

    # Reactivate target step
    activate_step_or_group(run_name, target_step_id, snapshot, current.assigned_to if current else None)
    frappe.db.commit()


def handle_forward(run_name, step_id, new_user):
    """Forward (reassign) current step to another user."""
    existing = _get_run_step(run_name, step_id)
    if not existing:
        frappe.throw(f"Bước {step_id} không tồn tại")

    old_user = existing.assigned_to
    frappe.db.set_value("Process Run Step", existing.name, "assigned_to", new_user, update_modified=False)
    _log_activity(run_name, existing.name, "Reassign", f"Chuyển tiếp từ {old_user} cho {new_user}")
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


# ---------------------------------------------------------------------------
# Multi-executor support
# ---------------------------------------------------------------------------

def activate_step_or_group(run_name, step_id, snapshot, previous_step_user=None):
    """Activate a step. For All mode, creates N run step records."""
    step_def = _get_step_def(snapshot, step_id)
    if not step_def:
        return

    approval_mode = step_def.get("approval_mode", "Any")
    run = frappe.get_doc("Process Run", run_name)
    executors = resolve_executors(step_def, run, previous_step_user)

    if approval_mode == "All" and len(executors) > 1:
        # Create one Process Run Step per executor
        for executor in executors:
            _create_or_update_run_step(run_name, step_id, step_def, executor)
    else:
        # Any mode or single executor: single run step
        executor = executors[0] if executors else None
        _create_or_update_run_step(run_name, step_id, step_def, executor)


def _create_or_update_run_step(run_name, step_id, step_def, executor):
    """Create or reactivate a Process Run Step for a specific executor."""
    # For All mode, check if this specific executor already has a record
    existing = frappe.get_all(
        "Process Run Step",
        filters={"run": run_name, "step_id": step_id, "assigned_to": executor},
        fields=["name", "status"],
    )

    if existing and existing[0].status == "Active":
        return

    if existing:
        step_doc = frappe.get_doc("Process Run Step", existing[0].name)
        step_doc.status = "Active"
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
    run = frappe.get_doc("Process Run", run_name)
    notify_step_activation(run, step_id, executor, step_def)


def is_step_group_complete(run_name, step_id):
    """Check if ALL run step records for this step_id are Completed (All mode)."""
    records = _get_run_steps_for_step_id(run_name, step_id)
    if not records:
        return False
    return all(r.status == "Completed" for r in records)


def resolve_executors(step_def, run, previous_step_user=None):
    """Resolve executor(s) for a step. Returns a list of user emails."""
    executor_type = step_def.get("executor_type", "")
    executor_value = step_def.get("executor_value", "")

    if executor_type == "Initiator":
        return [run.initiator]
    elif executor_type == "User":
        return [executor_value] if executor_value else [None]
    elif executor_type == "Role":
        users = frappe.get_all(
            "Has Role",
            filters={"role": executor_value, "parenttype": "User"},
            pluck="parent",
        )
        return users if users else [None]
    elif executor_type == "Direct Manager":
        reports_to = frappe.db.get_value("Employee", {"user_id": run.initiator}, "reports_to")
        if reports_to:
            manager_user = frappe.db.get_value("Employee", reports_to, "user_id")
            return [manager_user] if manager_user else [None]
        return [None]
    elif executor_type == "Previous Step Executor":
        return [previous_step_user] if previous_step_user else [None]
    elif executor_type == "Department":
        # Resolve all users in a department via Employee table
        employees = frappe.get_all(
            "Employee",
            filters={"department": executor_value, "status": "Active"},
            pluck="user_id",
        )
        users = [u for u in employees if u]
        return users if users else [None]

    return [None]


# Keep backward compat
def resolve_executor(step_def, run, previous_step_user=None):
    """Resolve single executor (backward compat)."""
    executors = resolve_executors(step_def, run, previous_step_user)
    return executors[0] if executors else None


# Keep backward compat
def activate_step(run_name, step_id, snapshot, previous_step_user=None):
    """Backward compat wrapper."""
    activate_step_or_group(run_name, step_id, snapshot, previous_step_user)


# ---------------------------------------------------------------------------
# Deadline engine
# ---------------------------------------------------------------------------

def check_deadlines():
    """Hourly scheduler: check all active steps for deadline violations."""
    active_steps = frappe.get_all(
        "Process Run Step",
        filters={"status": "Active"},
        fields=["name", "run", "step_id", "started_at"],
    )

    now = now_datetime()

    for step in active_steps:
        run = frappe.get_doc("Process Run", step.run)
        snapshot = _get_snapshot(run)
        step_def = _get_step_def(snapshot, step.step_id)

        if not step_def:
            continue

        deadline_type = step_def.get("deadline_type", "")
        if not deadline_type:
            continue

        deadline_dt = None

        if deadline_type == "Fixed Duration":
            duration_minutes = step_def.get("deadline_duration", 0)
            if duration_minutes and step.started_at:
                deadline_dt = add_to_date(get_datetime(step.started_at), minutes=duration_minutes)

        elif deadline_type == "From Field":
            field_step = step_def.get("deadline_field_step", "")
            field_name = step_def.get("deadline_field_name", "")
            if field_step and field_name:
                source_step = _get_run_step(step.run, field_step)
                if source_step and source_step.form_data:
                    form_data = json.loads(source_step.form_data) if isinstance(source_step.form_data, str) else source_step.form_data
                    field_val = form_data.get(field_name) if form_data else None
                    if field_val:
                        try:
                            deadline_dt = get_datetime(field_val)
                        except Exception:
                            pass

        if deadline_dt and now > deadline_dt:
            # Mark as overdue via activity log
            _log_activity(step.run, step.name, "Comment", "⚠ Bước đã quá hạn")
