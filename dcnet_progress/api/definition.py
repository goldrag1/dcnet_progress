# apps/dcnet_progress/dcnet_progress/api/definition.py
import json

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
        fields=["name", "title", "category", "version", "status", "owner_user", "modified"],
        order_by="modified desc",
        start=start,
        page_length=page_size,
    )

    total = frappe.db.count("Process Definition", frappe_filters)

    return {"data": definitions, "total": total, "page": page, "page_size": page_size}


@frappe.whitelist()
def get(name):
    """Get a single process definition with steps and transitions."""
    doc = frappe.get_doc("Process Definition", name)
    return {
        "name": doc.name,
        "title": doc.title,
        "description": doc.description,
        "category": doc.category,
        "version": doc.version,
        "status": doc.status,
        "owner_user": doc.owner_user,
        "graph_data": json.loads(doc.graph_data) if doc.graph_data else None,
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
                "position_x": s.position_x,
                "position_y": s.position_y,
            }
            for s in doc.steps
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
            for t in doc.transitions
        ],
    }


@frappe.whitelist(methods=["POST"])
def save(data):
    """Save a draft process definition (create or update)."""
    if isinstance(data, str):
        data = json.loads(data)

    name = data.get("name")

    if name:
        doc = frappe.get_doc("Process Definition", name)
    else:
        doc = frappe.new_doc("Process Definition")

    doc.title = data.get("title", "Quy trình mới")
    doc.description = data.get("description", "")
    doc.category = data.get("category", "")
    doc.graph_data = json.dumps(data.get("graph_data", {}))

    # Clear and rebuild steps
    doc.steps = []
    for step in data.get("steps", []):
        doc.append("steps", {
            "step_id": step["step_id"],
            "step_type": step.get("step_type", "Task"),
            "label": step.get("label", ""),
            "description": step.get("description", ""),
            "form_schema": json.dumps(step.get("form_schema", [])),
            "executor_type": step.get("executor_type", ""),
            "executor_value": step.get("executor_value", ""),
            "allow_reassign": step.get("allow_reassign", 0),
            "allow_return": step.get("allow_return", 0),
            "allow_forward": step.get("allow_forward", 0),
            "position_x": step.get("position_x", 0),
            "position_y": step.get("position_y", 0),
        })

    # Clear and rebuild transitions
    doc.transitions = []
    for t in data.get("transitions", []):
        doc.append("transitions", {
            "transition_id": t["transition_id"],
            "from_step": t["from_step"],
            "to_step": t["to_step"],
            "trigger": t.get("trigger", "On Complete"),
            "condition_type": t.get("condition_type", "Always"),
            "condition_json": json.dumps(t.get("condition_json")) if t.get("condition_json") else None,
            "label": t.get("label", ""),
        })

    doc.save()
    return {"name": doc.name, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def publish(name):
    """Publish a process definition: validate graph, bump version."""
    doc = frappe.get_doc("Process Definition", name)
    doc.version = (doc.version or 0) + 1
    doc.status = "Published"
    doc.save()  # triggers validate → _validate_graph
    return {"name": doc.name, "version": doc.version, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def suspend(name):
    """Suspend a published process definition."""
    doc = frappe.get_doc("Process Definition", name)
    doc.status = "Suspended"
    doc.save()
    return {"name": doc.name, "status": doc.status}
