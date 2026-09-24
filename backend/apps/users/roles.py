"""The four fixed roles, as a read-only reference for the Team > Roles page."""

ROLE_REFERENCE = [
    {
        "role": "ADMIN",
        "label": "Admin",
        "description": "Runs the whole system: people, money, settings and every record.",
        "can": [
            "See every lead, project, ledger, payment and report",
            "Create, edit and deactivate accounts; set commission rates",
            "Finalize won deals and read the audit log",
        ],
    },
    {
        "role": "SALES_MANAGER",
        "label": "Sales Manager",
        "description": "Leads the sales team and keeps the pipeline moving.",
        "can": [
            "See and edit every lead; assign and reassign them",
            "See the Sales report and the team's assignments (read-only)",
            "Reopen lost leads and mark won deals lost before payment",
        ],
    },
    {
        "role": "SALES_EXEC",
        "label": "Sales Executive",
        "description": "Works the leads assigned to them.",
        "can": [
            "See and work only their own leads",
            "Log calls and messages, set follow-ups, mark leads won or lost",
            "Never sees payments, ledgers or final project totals",
        ],
    },
    {
        "role": "PROJECT_MANAGER",
        "label": "Project Manager",
        "description": "Delivers projects within their sanctioned budget.",
        "can": [
            "See and update only their own projects and expenses",
            "See the sanctioned budget and budget alerts",
            "Never sees leads, payments or total project amounts",
        ],
    },
]
