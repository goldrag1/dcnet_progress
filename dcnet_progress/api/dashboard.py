# apps/dcnet_progress/dcnet_progress/api/dashboard.py
import json

import frappe


@frappe.whitelist()
def get_stats(days=None):
    """Dashboard stats matching frontend DashboardStats type.

    Returns:
        status_counts: [{status, count}] for all statuses
        backlog: [{definition_title, count}] — active steps by definition
        recent_completed: [{name, title, completed_at}]
    """
    # Status counts
    statuses = ["Running", "Completed", "Cancelled", "Rejected", "Draft"]
    status_counts = [
        {"status": s, "count": frappe.db.count("Process Run", {"status": s})}
        for s in statuses
    ]

    # Backlog: active Process Run Steps grouped by definition title
    backlog_rows = frappe.db.sql("""
        SELECT
            IFNULL(pd.title, s.run) AS definition_title,
            COUNT(*) AS count
        FROM `tabProcess Run Step` s
        LEFT JOIN `tabProcess Run` r ON r.name = s.run
        LEFT JOIN `tabProcess Definition` pd ON pd.name = r.definition
        WHERE s.status = 'Active'
        GROUP BY r.definition
        ORDER BY count DESC
        LIMIT 20
    """, as_dict=True)

    # Recent completed runs
    recent = frappe.get_all(
        "Process Run",
        filters={"status": "Completed"},
        fields=["name", "title", "completed_at"],
        order_by="completed_at desc",
        limit=10,
    )

    return {
        "status_counts": status_counts,
        "backlog": backlog_rows,
        "recent_completed": recent,
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
    statuses = ["Running", "Completed", "Cancelled", "Draft"]
    counts = {s: frappe.db.count("Process Run", {"status": s}) for s in statuses}
    total = frappe.db.count("Process Run")

    # Backlog by department
    backlog_dept = frappe.db.sql("""
        SELECT IFNULL(e.department, 'Không xác định') AS department, COUNT(*) AS count
        FROM `tabProcess Run Step` s
        LEFT JOIN `tabEmployee` e ON e.user_id = s.assigned_to AND e.status = 'Active'
        WHERE s.status = 'Active'
        GROUP BY e.department
        ORDER BY count DESC
        LIMIT 10
    """, as_dict=True)

    # Backlog by person with full_name
    backlog_person = frappe.db.sql("""
        SELECT s.assigned_to AS user, COUNT(*) AS count
        FROM `tabProcess Run Step` s
        WHERE s.status = 'Active' AND s.assigned_to IS NOT NULL
        GROUP BY s.assigned_to
        ORDER BY count DESC
        LIMIT 20
    """, as_dict=True)
    for p in backlog_person:
        p["full_name"] = frappe.db.get_value("User", p["user"], "full_name") or p["user"]

    return {
        "total": total,
        "running": counts.get("Running", 0),
        "completed": counts.get("Completed", 0),
        "cancelled": counts.get("Cancelled", 0),
        "draft": counts.get("Draft", 0),
        "backlog_by_dept": backlog_dept,
        "backlog_by_person": backlog_person,
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
