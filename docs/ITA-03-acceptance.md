# ITA-03 acceptance and QA

## Run

Run the setup script, then start backend and frontend using README. Existing databases need Alembic revision 0002. Use seller-a for the main flow and seller-b to test ownership.

## Manual scenarios and expected results

| Action | Expected result |
| --- | --- |
| Seller → New invoice → submit blank form | Field errors; no save or API request |
| Buyer email, Website design, quantity 1, price 200.00 → Preview | All details and USD 200.00 shown |
| Edit / Back → change quantity to 2 → Preview | USD 400.00; edited data retained |
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

35 backend test cases (existing 12 + invoice coverage) and four Vue component tests. Component tests exercise validation, preview/edit/save, failed-save retry, escaped content, exact arithmetic and reloading canonical server data. `npm run build` verifies packaging. Automated tests use fixtures; no PayPal or model credentials needed. Visual layout checks above remain manual.

Invoice versions are append-only through the API in this story: there is no update/delete endpoint. Application code does not provide database-administrator tamper protection. Later correction stories must create a new version.
