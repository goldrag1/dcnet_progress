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

    # Backlog by definition (active steps per process definition)
    backlog = frappe.db.sql(
        """
        SELECT pd.title as definition_title, COUNT(*) as count
        FROM `tabProcess Run Step` prs
        JOIN `tabProcess Run` pr ON pr.name = prs.run
        JOIN `tabProcess Definition` pd ON pd.name = pr.definition
        WHERE prs.status = 'Active'
        GROUP BY pd.name, pd.title
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

    # Recently completed runs (last 30 days)
    recent_completed = frappe.db.sql(
        """
        SELECT name, title, completed_at
        FROM `tabProcess Run`
        WHERE status = 'Completed' AND completed_at IS NOT NULL
        ORDER BY completed_at DESC
        LIMIT 10
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
        "recent_completed": [
            {
                "name": r.name,
                "title": r.title,
                "completed_at": str(r.completed_at) if r.completed_at else None,
            }
            for r in recent_completed
        ],
    }
