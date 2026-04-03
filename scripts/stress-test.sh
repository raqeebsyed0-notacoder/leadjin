#!/bin/bash
# LeadJin Enrichment Engine v2 — Stress Test + Triple Verification
# Enriches harvested leads and triple-verifies all contact data

TOKEN="9e6914ca4272454202e503463dd9d086f9acc028e548dd78784dcd5a7a0efe71"
BASE="http://localhost:3001"
RESULTS_DIR="/tmp/enrichment_stress"
mkdir -p "$RESULTS_DIR"

echo "=========================================="
echo "LEADJIN ENRICHMENT ENGINE v2 — STRESS TEST"
echo "$(date)"
echo "=========================================="

# Collect all harvested leads into one JSON array
python3 << 'PYEOF'
import json, os, sys

all_leads = []
niches = {'oil': 'Oil & Gas', 'realestate': 'Real Estate', 'fintech': 'Fintech', 'fashion': 'Fashion'}

for key, label in niches.items():
    path = f'/tmp/harvest_{key}.json'
    try:
        data = json.load(open(path))
        leads = data if isinstance(data, list) else data.get('leads', [])
        for lead in leads:
            lead['_niche'] = label
        all_leads.extend(leads)
        print(f"  {label}: {len(leads)} leads loaded")
    except Exception as e:
        print(f"  {label}: ERROR — {e}")

print(f"\nTotal leads to enrich: {len(all_leads)}")
json.dump(all_leads, open('/tmp/enrichment_stress/all_leads.json', 'w'))
PYEOF

TOTAL=$(python3 -c "import json; print(len(json.load(open('/tmp/enrichment_stress/all_leads.json'))))")
echo ""
echo "Starting enrichment of $TOTAL leads..."
echo ""

# Enrich each lead and collect results
python3 << 'PYEOF'
import json, subprocess, time, sys

leads = json.load(open('/tmp/enrichment_stress/all_leads.json'))
token = "9e6914ca4272454202e503463dd9d086f9acc028e548dd78784dcd5a7a0efe71"
results = []
stats = {'email_found': 0, 'phone_found': 0, 'linkedin_found': 0, 'whatsapp_verified': 0, 'x_found': 0, 'total': 0, 'errors': 0}
niche_stats = {}

for i, lead in enumerate(leads):
    name = lead.get('name', 'Unknown')
    company = lead.get('company', 'Unknown')
    domain = lead.get('website', '').replace('https://', '').replace('http://', '').split('/')[0] if lead.get('website') else None
    niche = lead.get('_niche', 'Unknown')

    if niche not in niche_stats:
        niche_stats[niche] = {'total': 0, 'email': 0, 'phone': 0, 'linkedin': 0, 'whatsapp': 0}

    print(f"[{i+1}/{len(leads)}] {name} @ {company} ({niche})...", end=' ', flush=True)

    try:
        payload = json.dumps({"name": name, "company": company, "domain": domain})
        result = subprocess.run(
            ['curl', '-s', '-m', '120', f'http://localhost:3001/api/leads/enrich-v2',
             '-H', 'Content-Type: application/json',
             '-H', f'Authorization: Bearer {token}',
             '-d', payload],
            capture_output=True, text=True, timeout=130
        )

        data = json.loads(result.stdout)
        results.append({**data, '_name': name, '_company': company, '_niche': niche})

        stats['total'] += 1
        niche_stats[niche]['total'] += 1

        if data.get('email'):
            stats['email_found'] += 1
            niche_stats[niche]['email'] += 1
        if data.get('phone'):
            stats['phone_found'] += 1
            niche_stats[niche]['phone'] += 1
        if data.get('linkedinUrl'):
            stats['linkedin_found'] += 1
            niche_stats[niche]['linkedin'] += 1
        if data.get('whatsappVerified'):
            stats['whatsapp_verified'] += 1
            niche_stats[niche]['whatsapp'] += 1
        if data.get('companyXHandle'):
            stats['x_found'] += 1

        dur = data.get('durationMs', 0)
        conf = data.get('emailConfidence', 0)
        email_short = (data.get('email') or 'MISS')[:30]
        print(f"email={email_short} ({conf}%) phone={'Y' if data.get('phone') else 'N'} wa={'Y' if data.get('whatsappVerified') else 'N'} [{dur/1000:.0f}s]")

    except Exception as e:
        stats['errors'] += 1
        stats['total'] += 1
        niche_stats[niche]['total'] += 1
        results.append({'_name': name, '_company': company, '_niche': niche, 'error': str(e)})
        print(f"ERROR: {e}")

# Save results
json.dump(results, open('/tmp/enrichment_stress/results.json', 'w'), indent=2)

# Print summary
print("\n" + "=" * 60)
print("STRESS TEST RESULTS")
print("=" * 60)
print(f"Total leads enriched: {stats['total']}")
print(f"Errors: {stats['errors']}")
print(f"")
print(f"Email found:      {stats['email_found']}/{stats['total']} ({100*stats['email_found']//max(1,stats['total'])}%)")
print(f"Phone found:      {stats['phone_found']}/{stats['total']} ({100*stats['phone_found']//max(1,stats['total'])}%)")
print(f"LinkedIn found:   {stats['linkedin_found']}/{stats['total']} ({100*stats['linkedin_found']//max(1,stats['total'])}%)")
print(f"WhatsApp verified:{stats['whatsapp_verified']}/{stats['total']} ({100*stats['whatsapp_verified']//max(1,stats['total'])}%)")
print(f"X handle found:   {stats['x_found']}/{stats['total']} ({100*stats['x_found']//max(1,stats['total'])}%)")
print(f"")
print("BY NICHE:")
for niche, ns in niche_stats.items():
    t = max(1, ns['total'])
    print(f"  {niche}: {ns['total']} leads | email {100*ns['email']//t}% | phone {100*ns['phone']//t}% | linkedin {100*ns['linkedin']//t}% | wa {100*ns['whatsapp']//t}%")

print("\nResults saved to /tmp/enrichment_stress/results.json")
PYEOF
