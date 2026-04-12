import frappe


def after_migrate():
    """Backfill step_order and action_trigger for Phase 2 migration."""
    _backfill_step_order()
    _backfill_action_trigger()
    frappe.db.commit()


def _backfill_step_order():
    """Set step_order from idx for steps that have step_order=0 or NULL."""
    steps = frappe.db.sql("""
        SELECT name, idx FROM `tabProcess Step`
        WHERE step_order IS NULL OR step_order = 0
    """, as_dict=True)

    for step in steps:
        frappe.db.set_value("Process Step", step.name, "step_order", step.idx, update_modified=False)

    if steps:
        frappe.logger().info(f"dcnet_progress: backfilled step_order for {len(steps)} steps")


def _backfill_action_trigger():
    """Map old trigger values to new action_trigger field."""
    trigger_map = {
        "On Complete": "Send",
        "On Reject": "Reject",
    }

    transitions = frappe.db.sql("""
        SELECT name, `trigger` FROM `tabProcess Transition`
        WHERE action_trigger IS NULL OR action_trigger = ''
    """, as_dict=True)

    for t in transitions:
        new_val = trigger_map.get(t.trigger, "Send")
        frappe.db.set_value("Process Transition", t.name, "action_trigger", new_val, update_modified=False)

    if transitions:
        frappe.logger().info(f"dcnet_progress: backfilled action_trigger for {len(transitions)} transitions")
