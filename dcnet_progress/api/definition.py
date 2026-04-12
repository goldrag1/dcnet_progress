# apps/dcnet_progress/dcnet_progress/api/definition.py
import json
import os

import frappe


@frappe.whitelist()
def get_list(filters=None, page=1, page_size=20):
    """List process definitions with pagination."""
    page = int(page)
    page_size = int(page_size)
    start = (page - 1) * page_size
    frappe_filters = {}
    if filters:
        if isinstance(filters, str):
            filters = json.loads(filters)
        if filters.get("status"):
            frappe_filters["status"] = filters["status"]
        if filters.get("category"):
            frappe_filters["category"] = filters["category"]

    definitions = frappe.get_all(
        "Process Definition",
        filters=frappe_filters,
        fields=["name", "title", "category", "version", "status", "owner_user", "icon", "modified"],
        order_by="modified desc",
        start=start,
        page_length=page_size,
    )
    total = frappe.db.count("Process Definition", frappe_filters)
    return {"data": definitions, "total": total, "page": page, "page_size": page_size}


@frappe.whitelist()
def get(name):
    """Get a single process definition with all Phase 2 fields."""
    doc = frappe.get_doc("Process Definition", name)
    steps = [
        {
            "step_id": s.step_id,
            "step_type": s.step_type,
            "label": s.label,
            "description": s.description,
            "step_order": s.step_order or s.idx,
            "form_schema": s.form_schema or "",
            "executor_type": s.executor_type or "",
            "executor_value": s.executor_value or "",
            "approval_mode": s.approval_mode or "Any",
            "allow_reassign": s.allow_reassign,
            "allow_return": s.allow_return,
            "allow_forward": s.allow_forward,
            "no_return": s.no_return,
            "deadline_type": s.deadline_type or "",
            "deadline_duration": s.deadline_duration or 0,
            "deadline_field_step": s.deadline_field_step or "",
            "deadline_field_name": s.deadline_field_name or "",
            "email_enabled": s.email_enabled,
            "email_subject": s.email_subject or "",
            "email_body": s.email_body or "",
            "email_cc": s.email_cc or "",
            "display_content": s.display_content or "",
            "previous_fields": s.previous_fields or "",
            "previous_editable": s.previous_editable,
            "position_x": s.position_x,
            "position_y": s.position_y,
        }
        for s in doc.steps
    ]
    transitions = [
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
        for t in doc.transitions
    ]
    return {
        "name": doc.name,
        "title": doc.title,
        "description": doc.description,
        "category": doc.category,
        "icon": doc.icon,
        "version": doc.version,
        "version_label": doc.version_label,
        "status": doc.status,
        "owner_user": doc.owner_user,
        "run_permission_type": doc.run_permission_type,
        "run_permission_value": doc.run_permission_value,
        "auto_title_template": doc.auto_title_template,
        "steps": steps,
        "transitions": transitions,
        "steps_json": json.dumps(steps),
        "transitions_json": json.dumps(transitions),
    }


@frappe.whitelist(methods=["POST"])
def save(definition=None):
    """Save a draft process definition (create or update)."""
    if definition is None:
        frappe.throw("Missing definition payload")
    if isinstance(definition, str):
        definition = json.loads(definition)

    name = definition.get("name")
    if name and frappe.db.exists("Process Definition", name):
        doc = frappe.get_doc("Process Definition", name)
    else:
        doc = frappe.new_doc("Process Definition")

    doc.title = definition.get("title") or "Quy trình mới"
    doc.description = definition.get("description", "")
    doc.category = definition.get("category", "")
    doc.icon = definition.get("icon", "")
    doc.run_permission_type = definition.get("run_permission_type", "All")
    doc.run_permission_value = definition.get("run_permission_value", "")
    doc.auto_title_template = definition.get("auto_title_template", "")

    raw_steps = definition.get("steps_json") or definition.get("steps") or "[]"
    if isinstance(raw_steps, str):
        raw_steps = json.loads(raw_steps)

    raw_transitions = definition.get("transitions_json") or definition.get("transitions") or "[]"
    if isinstance(raw_transitions, str):
        raw_transitions = json.loads(raw_transitions)

    doc.steps = []
    for i, step in enumerate(raw_steps):
        doc.append("steps", {
            "step_id": step.get("step_id", frappe.generate_hash(length=8)),
            "step_type": step.get("step_type", "Task"),
            "label": step.get("label", ""),
            "description": step.get("description", ""),
            "step_order": step.get("step_order", i + 1),
            "form_schema": step.get("form_schema") or None,
            "executor_type": step.get("executor_type", ""),
            "executor_value": step.get("executor_value", ""),
            "approval_mode": step.get("approval_mode", "Any"),
            "allow_reassign": step.get("allow_reassign", 0),
            "allow_return": step.get("allow_return", 0),
            "allow_forward": step.get("allow_forward", 0),
            "no_return": step.get("no_return", 0),
            "deadline_type": step.get("deadline_type", ""),
            "deadline_duration": step.get("deadline_duration", 0),
            "deadline_field_step": step.get("deadline_field_step", ""),
            "deadline_field_name": step.get("deadline_field_name", ""),
            "email_enabled": step.get("email_enabled", 0),
            "email_subject": step.get("email_subject", ""),
            "email_body": step.get("email_body", ""),
            "email_cc": step.get("email_cc", ""),
            "display_content": step.get("display_content") or None,
            "previous_fields": step.get("previous_fields") or None,
            "previous_editable": step.get("previous_editable", 0),
            "position_x": float(step.get("position_x", 0)),
            "position_y": float(step.get("position_y", 0)),
        })

    doc.transitions = []
    for t in raw_transitions:
        doc.append("transitions", {
            "transition_id": (t.get("from_step", "") + "__" + t.get("to_step", ""))[:140],
            "from_step": t.get("from_step", ""),
            "to_step": t.get("to_step", ""),
            "trigger": t.get("trigger", "On Complete"),
            "action_trigger": t.get("action_trigger", "Send"),
            "condition_type": t.get("condition_type", "Always"),
            "condition_json": json.dumps(t.get("condition_json")) if t.get("condition_json") else None,
            "label": t.get("label", ""),
            "target_mode": t.get("target_mode", "Next Step"),
            "target_step_id": t.get("target_step_id", ""),
        })

    if doc.status == "Published":
        doc.status = "Draft"
    doc.save()
    return {
        "name": doc.name, "title": doc.title, "status": doc.status, "version": doc.version,
        "steps_json": json.dumps(raw_steps),
        "transitions_json": json.dumps(raw_transitions),
    }


@frappe.whitelist(methods=["POST"])
def publish(name):
    """Publish a process definition."""
    doc = frappe.get_doc("Process Definition", name)
    doc.version = (doc.version or 0) + 1
    doc.status = "Published"
    doc.save()
    return {"name": doc.name, "version": doc.version, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def suspend(name):
    """Suspend a published process definition."""
    doc = frappe.get_doc("Process Definition", name)
    doc.status = "Suspended"
    doc.save()
    return {"name": doc.name, "status": doc.status}


# ---------------------------------------------------------------------------
# Version management
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_versions(name):
    """Get version history from track_changes."""
    versions = frappe.get_all(
        "Version",
        filters={"ref_doctype": "Process Definition", "docname": name},
        fields=["name", "owner", "creation", "data"],
        order_by="creation desc",
        limit=20,
    )
    return [{
        "name": v.name, "owner": v.owner, "creation": str(v.creation),
    } for v in versions]


@frappe.whitelist(methods=["POST"])
def restore_version(name, version_name):
    """Restore a definition from a previous version."""
    version = frappe.get_doc("Version", version_name)
    if version.ref_doctype != "Process Definition" or version.docname != name:
        frappe.throw("Phiên bản không thuộc quy trình này")

    data = json.loads(version.data) if isinstance(version.data, str) else version.data
    doc = frappe.get_doc("Process Definition", name)

    # Restore changed fields
    for change in data.get("changed", []):
        if hasattr(doc, change[0]):
            setattr(doc, change[0], change[1])  # restore to old value

    doc.status = "Draft"
    doc.save()
    return {"name": doc.name, "status": doc.status}


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_templates():
    """Load process templates from JSON files."""
    templates_dir = os.path.join(
        frappe.get_app_path("dcnet_progress"), "templates"
    )
    templates = []
    if not os.path.exists(templates_dir):
        return templates

    for fname in sorted(os.listdir(templates_dir)):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(templates_dir, fname)
        with open(fpath) as f:
            tpl = json.load(f)
        templates.append({
            "name": fname.replace(".json", ""),
            "title": tpl.get("title", fname),
            "category": tpl.get("category", ""),
            "description": tpl.get("description", ""),
            "icon": tpl.get("icon", ""),
        })
    return templates


@frappe.whitelist(methods=["POST"])
def create_from_template(template_name, title=None):
    """Create a draft definition from a template JSON."""
    templates_dir = os.path.join(
        frappe.get_app_path("dcnet_progress"), "templates"
    )
    fpath = os.path.join(templates_dir, f"{template_name}.json")
    if not os.path.exists(fpath):
        frappe.throw(f"Mẫu '{template_name}' không tồn tại")

    with open(fpath) as f:
        tpl = json.load(f)

    tpl["title"] = title or tpl.get("title", "Quy trình mới")
    tpl["name"] = None  # force create new
    return save(definition=json.dumps(tpl))
