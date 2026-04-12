# apps/dcnet_progress/dcnet_progress/notifications.py
import frappe


def notify_step_activation(run, step_id, assigned_to, step_def):
    """Send notification when a step is activated."""
    if not assigned_to:
        return

    definition_title = frappe.db.get_value("Process Definition", run.definition, "title") or run.definition
    step_label = step_def.get("label", step_id)

    # Create Notification Log (shows in Frappe Desk bell icon)
    try:
        notification = frappe.new_doc("Notification Log")
        notification.for_user = assigned_to
        notification.from_user = frappe.session.user
        notification.type = "Alert"
        notification.document_type = "Process Run"
        notification.document_name = run.name
        notification.subject = f"Bạn có việc cần xử lý trong quy trình {definition_title}"
        notification.email_content = f"Bước: {step_label}"
        notification.insert(ignore_permissions=True)
    except Exception:
        frappe.log_error("Lỗi tạo Notification Log cho Process Run")

    # Send email
    try:
        frappe.sendmail(
            recipients=[assigned_to],
            subject=f"Việc cần xử lý: {definition_title} - {step_label}",
            message=f"""
                <p>Xin chào,</p>
                <p>Bạn được giao xử lý bước <b>{step_label}</b> trong quy trình <b>{definition_title}</b>.</p>
                <p>Vui lòng truy cập <a href="/process/runs/{run.name}">tại đây</a> để thực hiện.</p>
            """,
            now=True,
        )
    except Exception:
        frappe.log_error("Lỗi gửi email cho Process Run")

    # Publish realtime event
    frappe.publish_realtime(
        "process_task",
        {
            "run": run.name,
            "step_id": step_id,
            "step_label": step_label,
            "definition_title": definition_title,
        },
        user=assigned_to,
    )
