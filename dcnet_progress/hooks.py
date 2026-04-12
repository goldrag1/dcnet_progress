from . import __version__ as app_version

app_name = "dcnet_progress"
app_title = "DCNet Progress"
app_publisher = "DCNet"
app_description = "Business Process Management for ERPNext"
app_email = "admin@dcnet.vn"
app_license = "MIT"

add_to_apps_screen = [
    {
        "name": "dcnet_progress",
        "logo": "/assets/frappe/images/frappe-framework-logo.svg",
        "title": "Quy trình",
        "route": "/process",
    }
]

website_route_rules = [
    {"from_route": "/process/<path:app_path>", "to_route": "process"},
]

after_migrate = ["dcnet_progress.migrate.after_migrate"]

has_permission = {
    "Process Run": "dcnet_progress.permissions.has_process_run_permission",
}

scheduler_events = {
    "hourly": [
        "dcnet_progress.engine.check_deadlines",
    ],
}
