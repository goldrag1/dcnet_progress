import frappe


def has_process_run_permission(doc, ptype=None, user=None):
    """Permission hook for Process Run: initiator, assigned, or admin."""
    if not user:
        user = frappe.session.user

    if user == "Administrator":
        return True

    if "System Manager" in frappe.get_roles(user):
        return True

    # Initiator can always view/edit their own runs
    if doc.initiator == user:
        return True

    # Anyone assigned to an active step can access the run
    assigned = frappe.get_all(
        "Process Run Step",
        filters={"run": doc.name, "assigned_to": user},
        limit=1,
    )
    if assigned:
        return True

    return False


def has_process_definition_start_permission(definition_name, user=None):
    """Check if user can start a run of this definition (per-definition ACL)."""
    if not user:
        user = frappe.session.user

    if user == "Administrator" or "System Manager" in frappe.get_roles(user):
        return True

    definition = frappe.get_doc("Process Definition", definition_name)
    perm_type = definition.run_permission_type or "All"

    if perm_type == "All":
        return True
    elif perm_type == "User":
        allowed = [u.strip() for u in (definition.run_permission_value or "").split(",")]
        return user in allowed
    elif perm_type == "Role":
        user_roles = frappe.get_roles(user)
        allowed_roles = [r.strip() for r in (definition.run_permission_value or "").split(",")]
        return bool(set(user_roles) & set(allowed_roles))
    elif perm_type == "Department":
        emp_dept = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "department")
        allowed_depts = [d.strip() for d in (definition.run_permission_value or "").split(",")]
        return emp_dept in allowed_depts

    return False
