# Open decisions

Business rules not yet confirmed. Each has a **recommended default**; build to the default unless told otherwise,
and record the final answer here.

| # | Decision | Recommended default |
| --- | --- | --- |
| 1 | **Who sets the Total Amount?** | The Sales Exec *proposes* an amount on the lead; the Admin *finalises* it when the Ledger is created. Only the Admin can change it afterwards. |
| 2 | **Lost status and reason** | Add a `LOST` lead status. Marking a lead Lost requires a reason (choice + optional note). Lost leads are kept (soft delete), excluded from the funnel's active count, and can be reopened by a Sales Manager. |
| 3 | **Expense over budget** | Block an expense that would push total expenses above the Sanctioned Budget. An Admin can override with a mandatory reason, which is logged. PM sees a Budget Alert at 80% and 100%. **Built:** `BLOCK_OVER_BUDGET = True` (`apps/projects/rules.py`); an expense of exactly the remaining budget is allowed and lands on "near limit" (80% to 100% inclusive); the override flags the expense (`is_override`); alerts go to every active admin once per upward change. |
| 4 | **Sanctioned budget vs total amount** | `sanctioned_budget <= total_amount`, enforced when the Admin sets it (never shown to a PM as a comparison). The gap is the planned margin. |
| 5 | **Overpayment rule** | Reject a payment that would make total payments exceed the Ledger's total amount. Refunds/adjustments are separate entries made by an Admin. |
| 6 | **Profit margin definition** | Margin = Total Amount − total Expenses, shown as an amount and as % of Total Amount. Commission is *not* deducted until decision 7 is settled. Only Admin sees it. **The project detail shows two figures** (`selectors.project_margins`): *live margin* = received minus expenses, and *planned margin* = total minus sanctioned budget. Confirm this is the definition you want. |
| 7 | **Commission rate** | `users.commission_rate` is a percentage of the **received payments** (not the total amount) of a won deal, paid to the Sales Exec who owns it. Snapshot the rate on the deal when it is won so later rate changes don't rewrite history. |
| 8 | **Soft delete + audit log for money records** | Ledgers, payments and expenses are never hard-deleted (`SoftDeleteModel`). Every create/update/delete writes an audit-log entry (who, when, before/after). Only an Admin can delete. |
| 9 | **Who can reopen a completed project** | Admin only, with a reason. It is logged in the audit trail. |
| 10 | **WhatsApp approach** | Phase 1: `wa.me` click-to-chat links with a pre-filled template message, and a manual Message Log. Phase 2 (later): WhatsApp Business (Meta Cloud) API for automated sends. |
| 11 | **Dashboard "Year" and "Quarter"** | Indian financial year (1 April to 31 March); quarters Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar. Change `FINANCIAL_YEAR_START_MONTH` in `apps/reports/services.py` to 1 for calendar years. |
| 12 | **Dashboard for non-admin roles** | Admin-only for now (the KPIs include money). Sales Manager and others see a "coming soon" note on /dashboard until role dashboards are specified. |
| 13 | **Can a Sales Exec create leads?** (`EXEC_CAN_CREATE_LEADS` in `apps/leads/services.py`) | **Undecided.** Default `False`: managers add and assign leads; execs work their own. |
| 14 | **Who sees the finalized total on a lead?** (`FINAL_AMOUNT_VISIBLE_TO`) | **Undecided.** Default `{"ADMIN", "SALES_MANAGER"}`; an Exec never sees it. |
| 15 | **PM edit window for expenses** (`PM_EDIT_WINDOW_MINUTES` in `apps/projects/rules.py`) | **Undecided.** Default 30 minutes: the PM who logged an expense may edit or void it within 30 minutes; after that, or for anyone else's expense, only an Admin. Never on a completed project. |
| 16 | **Client name visible to a PM** | **Undecided.** Default yes: the project carries `client_name` (copied from the lead when converted) and a PM sees it. The lead itself (phone, email, source, exec, value) is never shown. To hide it, remove `client_name` from `ProjectPMSerializer`. |
| 17 | **Receipt rules** (`RECEIPT_REQUIRED`, `RECEIPT_EXEMPT_CATEGORIES` in `apps/projects/rules.py`) | **Undecided.** Default: a receipt is required for every category except Labour; JPG, PNG, WebP or PDF up to 5 MB, checked by the file's bytes; images are re-encoded (EXIF removed, at most 1600 px). Receipts have no public URL. |
| 18 | **Suggested sanctioned budget** (`SUGGESTED_BUDGET_PCT`) | **Undecided.** Default 60% of the deal total, prefilled on the convert panel; the Admin can change it up to the total. |
| 19 | **Convert before the deal is finalized** | Until accounts exposes `get_project_finance`, conversion is allowed and the budget ceiling is the lead's proposed amount. Once it exists, only finalized deals can be converted (see API_CONTRACT). |
| 20 | **Budget changes on a completed project** | Blocked (`project_completed`). The Admin reopens the project first. |
