# LeadJin Project Architecture & Database Context

## Database & API Structure
- Primary Database: SQLite at `./leadjin.db`. Live read 2026-11-25: 37 tables; `leads`, `lead_replies`, `outreach_messages`, `company_cache`, `intent_signals` present; `crm_pipeline`, `companies`, `contacts` do NOT exist.
- Backend Server: Express.js running on port 3001.
- Lead Routes: `POST /api/leads`, `GET /api/leads`, `POST /api/crm/pipeline`, `GET /api/credits/balance`.

## Agent Action Directives
- When instructed to "add to pipeline" or "save leads", execute database writes directly via SQLite query tools or by calling the local Express API (`POST /api/leads`).
- Lead Record Structure: Always structure leads with `company_name`, `industry`, `location`, `contact_person`, `title`, `email`, `phone`, `lead_status` ('Trial / Prospect'), and `source` ('LeadJin Harvest').
