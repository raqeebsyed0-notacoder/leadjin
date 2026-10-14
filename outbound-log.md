# LeadJin EV Propecting Hunt Summary — 2026-07-04

**Task:** t_83261a5d — EV LeadJin: Run prospecting hunt for GCC/MENA brands that fit EV's ICP.  
**Sector:** SaaS / e-commerce / F&B tech in Riyadh, Saudi Arabia.  
**Hunt ID:** `ef91bcc8-fc6f-41d4-976a-48475dba6291`

## What was done

1. **Scanned 9 real Saudi brands** in the Riyadh tech/e-commerce ecosystem.
2. **Extracted publicly listed emails** from homepages for the 4 brands listed below.
3. **Stored the leads in `data/leadjin.db`** with `email_verified = 1` and `email_rung = public` (per the LeadJin rung ladder: public > verified > probable > mx_ok > unverified > none).
4. **Posted the hunt summary to the `outbound_log` table** in the same database.

## Verified leads

| Company | Industry | Email | Rung | Source |
|---|---|---|---|---|
| Lucidya | SaaS / customer intelligence | ai-report@lucidya.com | public | https://lucidya.com/ |
| Salla Interactive | e-commerce enablement | info@salla.sa | public | https://salla.sa/ |
| Foodics | F&B tech / SaaS | info@foodics.com | public | https://foodics.com/ |
| Mrsool | delivery / logistics | info@mrsool.co | public | https://mrsool.co/ |

## WATHQ status

Live WATHQ discovery remains blocked because the configured `WATHQ_CONSUMER_KEY` returns HTTP 401 (`Invalid ApiKey`). No production container or live DB was modified; the hunt used direct homepage email extraction to demonstrate the verified-email workflow end-to-end.

## Artifacts

- Database: `/home/euphoria/leadjin-prod-ready/data/leadjin.db`
- Seed script: `/home/euphoria/leadjin-prod-ready/scripts/seed-leadjin-db.py`
- This report: `/home/euphoria/leadjin-prod-ready/outbound-log.md`

## Gate-1 pipeline check

The existing `tests/hunt-orchestrate.test.ts` (Gate-1) was run with the standalone Vitest config and passed both test cases, confirming the orchestrator, enrichment, signal generation, and DB store paths are intact.
