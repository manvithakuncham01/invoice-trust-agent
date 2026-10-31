# ITA-03 QA handoff

Status: automated checks passed; independent acceptance and visual QA pending.

## Changes in this pass

- Invalid or incomplete amount inputs display a dash instead of contributing to a misleading total.
- Quantity and price controls expose invalid states for accessibility.
- Removed obsolete state from the previous two-step preview flow.
- Added tests for pending-save locking, server field errors, invalid preview values and item removal.
- Added backend boundary tests for quantity, price, item count, field lengths and large exact totals.

## Executed checks

| Check | Result |
| --- | --- |
| Backend pytest suite | 39 passed; two dependency deprecation warnings |
| Frontend Node/Vue DOM suite | 9 passed |
| Frontend Vite production build | Passed |
| Exact arithmetic: 3 × 0.10 + 1 × 0.20 | 0.50 |
| Invalid amount preview | Dash; invalid save rejected |
| Retry same save operation | Same key reused; backend returns same invoice |
| Duplicate click while pending | Only one frontend request |
| Failed database insert | Case and version rolled back together |
| Cross-seller case access | 404 |
| Buyer/reviewer create request | 403 |
| HTML in seller input | Escaped as text |
| Maximum valid price × quantity | Exact decimal total |

## Developer B independent acceptance

Use the linked cases in the authoritative Rebalanced Cross-QA plan and the scenarios in ITA-03-acceptance.md. Do not mark them independently passed merely because the automated suite passed.

1. Pull feature/ita-03-invoice-drafts and start the app using README.
2. Sign in as seller-a; confirm the invoice list opens directly.
3. Create an invoice, compare form and live preview, change quantity, add/remove items, save and reload.
4. Confirm the invoice appears under seller-a and is inaccessible under seller-b.
5. Test form field messages and retain input after a simulated network failure.
6. Check keyboard operation and layout at 1440px and 390px widths against the supplied PDF.
7. Record case ID, expected/actual result, browser, evidence, tester and pass/fail for each linked case.

Browser visual verification could not run in the implementation environment because the Chromium download failed. DOM tests do not verify CSS layout. This story remains ready for independent QA, not accepted or merged.

All data remains local SQLite. This work does not require Render, Elastic, PayPal credentials or an LLM key.
