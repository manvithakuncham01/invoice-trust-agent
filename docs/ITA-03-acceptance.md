# ITA-03 acceptance and QA

## Run

Run the setup script, then start backend and frontend using README. Existing databases need Alembic revision 0002. Use seller-a for the main flow and seller-b to test ownership.

## Manual scenarios and expected results

| Action | Expected result |
| --- | --- |
| Seller → New invoice → submit blank form | Field errors; no save or API request |
| Buyer email, Website design, quantity 1, price 200.00 | All details and USD 200.00 shown |
| Edit → change quantity to 2 | USD 400.00; edited data retained |
| Add a second item; remove it | Totals update; final remaining item cannot be removed |
| Save draft | Draft saved; version 1, DRAFT, canonical totals; no PayPal ID |
| Reload saved URL; return to seller workspace | Saved values persist; draft appears in list |
| Switch to seller-b; open seller-a URL | Invoice not found; seller-b list contains no seller-a invoice |
| Switch to buyer/reviewer; open invoice form URL | Access denied |
| Fractional/zero quantity, malformed email, >2 decimal price | Field errors, no saved record |
| API request with seller_id, total, unknown fields, >100 items | 422 field errors |
| Retry same POST with same key and same body | 200, same case ID; one case/version |
| Same key, different body | 409; original draft unchanged |
| Simulate network failure during save, then retry | Input/preview retained; same key prevents duplicate committed draft |
| Server validation rejects email accepted by simple browser check | Form returns with server field error; input retained |
| Seller types HTML/script into item or note | Rendered as text; never executed |
| 3 × 0.10 plus 1 × 0.20 | Preview and server both 0.50 |
| Missing CSRF / session | 403 / 401, no new draft |
| Database failure after inserting case but before version | Rollback both records; safe error; retry possible |
| Narrow screen and keyboard navigation | Stacked controls, visible focus and accessible labels |

## Automated evidence

35 backend test cases (existing 12 + invoice coverage) and five frontend tests. Component tests exercise validation, live preview/edit/save, failed-save retry, escaped content, exact arithmetic and reloading canonical server data. `npm run build` verifies packaging. Automated tests use fixtures; no PayPal or model credentials needed. Visual layout checks above remain manual.

Invoice versions are append-only through the API in this story: there is no update/delete endpoint. Application code does not provide database-administrator tamper protection. Later correction stories must create a new version.

## Screen-design alignment

Reference: supplied Invoice Trust Agent screen designs, pages 1 (New invoice), 2 (case layout) and 5 (Invoices). Compact navy top navigation, light canvas, white bordered panels, teal primary actions, amber draft badges. Invoice form and live preview are side by side on wide screens and stack on narrow screens. Restored seller sessions open Invoices directly. Demo account switching stays inside a closed account menu.

The form uses local exact-cent preview arithmetic; the server recalculates canonical totals on save. Future agent, evidence, buyer invitation and PayPal controls are not shown as functioning features. The remaining PDF screens will be implemented with their owning stories. There is no fake data in the invoice list.

Manual visual QA: compare at 1440px and 390px widths; check no clipped amounts, horizontal page overflow, or overlapping controls. Full visual browser verification is not part of the automated DOM suite.
