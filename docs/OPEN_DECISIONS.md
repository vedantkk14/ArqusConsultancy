# Open decisions

Business rules not yet confirmed. Each has a **recommended default**; build to the default unless told otherwise,
and record the final answer here.

| # | Decision | Recommended default |
| --- | --- | --- |
| 1 | **Who sets the Total Amount?** | The Sales Exec *proposes* an amount on the lead; the Admin *finalises* it when the Ledger is created. Only the Admin can change it afterwards. |
| 2 | **Lost status and reason** | Add a `LOST` lead status. Marking a lead Lost requires a reason (choice + optional note). Lost leads are kept (soft delete), excluded from the funnel's active count, and can be reopened by a Sales Manager. |
| 3 | **Expense over budget** | Block an expense that would push total expenses above the Sanctioned Budget. An Admin can override with a mandatory reason, which is logged. PM sees a Budget Alert at 80% and 100%. |
| 4 | **Sanctioned budget vs total amount** | `sanctioned_budget <= total_amount`, enforced when the Admin sets it (never shown to a PM as a comparison). The gap is the planned margin. |
| 5 | **Overpayment rule** | Reject a payment that would make total payments exceed the Ledger's total amount. Refunds/adjustments are separate entries made by an Admin. |
| 6 | **Profit margin definition** | Margin = Total Amount − total Expenses, shown as an amount and as % of Total Amount. Commission is *not* deducted until decision 7 is settled. Only Admin sees it. |
| 7 | **Commission rate** | `users.commission_rate` is a percentage of the **received payments** (not the total amount) of a won deal, paid to the Sales Exec who owns it. Snapshot the rate on the deal when it is won so later rate changes don't rewrite history. |
| 8 | **Soft delete + audit log for money records** | Ledgers, payments and expenses are never hard-deleted (`SoftDeleteModel`). Every create/update/delete writes an audit-log entry (who, when, before/after). Only an Admin can delete. |
| 9 | **Who can reopen a completed project** | Admin only, with a reason. It is logged in the audit trail. |
| 10 | **WhatsApp approach** | Phase 1: `wa.me` click-to-chat links with a pre-filled template message, and a manual Message Log. Phase 2 (later): WhatsApp Business (Meta Cloud) API for automated sends. |
