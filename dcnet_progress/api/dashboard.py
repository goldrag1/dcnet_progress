# apps/dcnet_progress/dcnet_progress/api/dashboard.py
import frappe


@frappe.whitelist()
def get_stats():
    """Dashboard statistics: runs by status, backlog by user, avg completion time."""
    # Runs by status
    status_counts = frappe.db.sql(
        """
        SELECT status, COUNT(*) as count
        FROM `tabProcess Run`
        GROUP BY status
        """,
        as_dict=True,
    )

    # Backlog by user (active steps per user)
    backlog = frappe.db.sql(
        """
        SELECT assigned_to, COUNT(*) as count
        FROM `tabProcess Run Step`
        WHERE status = 'Active' AND assigned_to IS NOT NULL
        GROUP BY assigned_to
        ORDER BY count DESC
        LIMIT 10
        """,
        as_dict=True,
    )

    # Avg completion time (in hours) for completed runs
    avg_time = frappe.db.sql(
        """
        SELECT AVG(TIMESTAMPDIFF(HOUR, creation, completed_at)) as avg_hours
        FROM `tabProcess Run`
        WHERE status = 'Completed' AND completed_at IS NOT NULL
        """,
        as_dict=True,
    )

    # Total counts
    total_runs = frappe.db.count("Process Run")
    total_definitions = frappe.db.count("Process Definition", {"status": "Published"})
    active_steps = frappe.db.count("Process Run Step", {"status": "Active"})

    return {
        "status_counts": status_counts,
        "backlog": backlog,
        "avg_completion_hours": avg_time[0].get("avg_hours") if avg_time else 0,
        "total_runs": total_runs,
        "total_definitions": total_definitions,
        "active_steps": active_steps,
    }
