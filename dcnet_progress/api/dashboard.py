# apps/dcnet_progress/dcnet_progress/api/dashboard.py
import json

import frappe


@frappe.whitelist()
def get_stats():
    """Dashboard overview: 5 stat cards + backlog data."""
    total = frappe.db.count("Process Run")
    running = frappe.db.count("Process Run", {"status": "Running"})
    completed = frappe.db.count("Process Run", {"status": "Completed"})
    cancelled = frappe.db.count("Process Run", {"status": "Cancelled"})
    draft = frappe.db.count("Process Run", {"status": "Draft"})

    # Backlog by department (via Employee → department of assigned_to)
    backlog_dept = frappe.db.sql("""
        SELECT IFNULL(e.department, 'Không xác định') as department, COUNT(*) as count
        FROM `tabProcess Run Step` s
        LEFT JOIN `tabEmployee` e ON e.user_id = s.assigned_to AND e.status = 'Active'
        WHERE s.status = 'Active'
        GROUP BY e.department
        ORDER BY count DESC
        LIMIT 10
    """, as_dict=True)

    # Backlog by person
    backlog_person = frappe.db.sql("""
        SELECT s.assigned_to as user, COUNT(*) as count
        FROM `tabProcess Run Step` s
        WHERE s.status = 'Active' AND s.assigned_to IS NOT NULL
        GROUP BY s.assigned_to
        ORDER BY count DESC
        LIMIT 20
    """, as_dict=True)

    # Avg completion time
    avg_time = frappe.db.sql("""
        SELECT AVG(TIMESTAMPDIFF(HOUR, started_at, completed_at)) as avg_hours
        FROM `tabProcess Run`
        WHERE status = 'Completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL
    """, as_dict=True)

    return {
        "stat_cards": {
            "total": total,
            "running": running,
            "completed": completed,
            "cancelled": cancelled,
            "draft": draft,
        },
        "backlog_department": backlog_dept,
        "backlog_person": backlog_person,
        "avg_completion_hours": avg_time[0].get("avg_hours") if avg_time else 0,
    }


@frappe.whitelist()
def get_detail_report(definition=None, status=None, page=1, page_size=50):
    """Filtered detail report for runs."""
    page = int(page)
    page_size = int(page_size)
    start = (page - 1) * page_size

    filters = {}
    if definition:
        filters["definition"] = definition
    if status:
        filters["status"] = status

    runs = frappe.get_all(
        "Process Run",
        filters=filters,
        fields=["name", "title", "definition", "initiator", "status", "started_at", "completed_at"],
        order_by="started_at desc",
        start=start,
        page_length=page_size,
    )
    for r in runs:
        r["definition_title"] = frappe.db.get_value("Process Definition", r["definition"], "title") or ""

    total = frappe.db.count("Process Run", filters)
    return {"data": runs, "total": total, "page": page, "page_size": page_size}


@frappe.whitelist()
def get_overview(days=None, definition=None):
    """Returns DashboardOverview matching frontend type."""
    stats = get_stats()
    sc = stats["stat_cards"]
    # Enrich backlog_person with full_name
    people = stats["backlog_person"]
    for p in people:
        p["full_name"] = frappe.db.get_value("User", p["user"], "full_name") or p["user"]
    return {
        "total": sc["total"],
        "running": sc["running"],
        "completed": sc["completed"],
        "cancelled": sc["cancelled"],
        "draft": sc["draft"],
        "backlog_by_dept": stats["backlog_department"],
        "backlog_by_person": people,
    }


@frappe.whitelist()
def export_csv(days=None):
    """Trigger CSV download — delegates to export_excel."""
    return export_excel()


@frappe.whitelist()
def export_excel(definition=None, status=None):
    """Export runs to Excel (CSV for simplicity)."""
    filters = {}
    if definition:
        filters["definition"] = definition
    if status:
        filters["status"] = status

    runs = frappe.get_all(
        "Process Run",
        filters=filters,
        fields=["name", "title", "definition", "initiator", "status", "started_at", "completed_at"],
        order_by="started_at desc",
        limit=5000,
    )

    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Mã", "Tiêu đề", "Quy trình", "Người tạo", "Trạng thái", "Bắt đầu", "Hoàn thành"])
    for r in runs:
        def_title = frappe.db.get_value("Process Definition", r["definition"], "title") or ""
        writer.writerow([r.name, r.title, def_title, r.initiator, r.status, r.started_at, r.completed_at])

    frappe.response["filename"] = "bao-cao-quy-trinh.csv"
    frappe.response["filecontent"] = output.getvalue()
    frappe.response["type"] = "download"
