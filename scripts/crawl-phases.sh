#!/bin/bash
# LeadJin Pre-Crawl — 4 Phases covering all 20 KSA cities × 25 industries
# Run: nohup bash scripts/crawl-phases.sh &

TOKEN="9e6914ca4272454202e503463dd9d086f9acc028e548dd78784dcd5a7a0efe71"
BASE="http://localhost:3001"
ALL_INDUSTRIES='["Oil & Gas","Real Estate & Property Development","Fintech & Banking","Fashion & Retail","Healthcare & Pharma","Education & EdTech","Logistics & Supply Chain","Construction & Engineering","Food & Beverage","IT & Software","Manufacturing","Tourism & Hospitality","Agriculture & AgriTech","Legal Services","Management Consulting","Telecommunications","Automotive","E-commerce","Media & Advertising","Renewable Energy","Mining & Metals","Insurance","Defense & Aerospace","Sports & Entertainment","Environmental Services"]'

echo "=== LEADJIN PRE-CRAWL — FULL KSA COVERAGE ==="
echo "=== $(date) ==="

# Phase 1 already running. Wait for it by polling stats.
echo ""
echo "--- Phase 1 running (Riyadh, Jeddah, Dammam, Khobar, Dhahran) ---"
while true; do
  RUNNING=$(curl -s "$BASE/api/precrawl/stats" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('crawl_jobs',{}).get('running',0))" 2>/dev/null)
  DONE=$(curl -s "$BASE/api/precrawl/stats" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_companies',0))" 2>/dev/null)
  echo "  [$(date +%H:%M)] Running: $RUNNING | Companies: $DONE"
  if [ "$RUNNING" = "0" ]; then break; fi
  sleep 60
done
echo "Phase 1 DONE"

# Phase 2
echo ""
echo "--- Phase 2: Makkah, Madinah, Tabuk, Jubail, Yanbu ---"
curl -s -X POST "$BASE/api/precrawl/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"cities\":[\"Makkah\",\"Madinah\",\"Tabuk\",\"Jubail\",\"Yanbu\"],\"industries\":$ALL_INDUSTRIES,\"delay_ms\":3000}" > /dev/null

while true; do
  RUNNING=$(curl -s "$BASE/api/precrawl/stats" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('crawl_jobs',{}).get('running',0))" 2>/dev/null)
  DONE=$(curl -s "$BASE/api/precrawl/stats" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_companies',0))" 2>/dev/null)
  echo "  [$(date +%H:%M)] Running: $RUNNING | Companies: $DONE"
  if [ "$RUNNING" = "0" ]; then break; fi
  sleep 60
done
echo "Phase 2 DONE"

# Phase 3
echo ""
echo "--- Phase 3: Taif, Abha, Hail, Jazan, NEOM ---"
curl -s -X POST "$BASE/api/precrawl/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"cities\":[\"Taif\",\"Abha\",\"Hail\",\"Jazan\",\"NEOM\"],\"industries\":$ALL_INDUSTRIES,\"delay_ms\":3000}" > /dev/null

while true; do
  RUNNING=$(curl -s "$BASE/api/precrawl/stats" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('crawl_jobs',{}).get('running',0))" 2>/dev/null)
  DONE=$(curl -s "$BASE/api/precrawl/stats" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_companies',0))" 2>/dev/null)
  echo "  [$(date +%H:%M)] Running: $RUNNING | Companies: $DONE"
  if [ "$RUNNING" = "0" ]; then break; fi
  sleep 60
done
echo "Phase 3 DONE"

# Phase 4
echo ""
echo "--- Phase 4: KAEC, Najran, Buraidah, Khamis Mushait, Al Ahsa ---"
curl -s -X POST "$BASE/api/precrawl/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"cities\":[\"KAEC\",\"Najran\",\"Buraidah\",\"Khamis Mushait\",\"Al Ahsa\"],\"industries\":$ALL_INDUSTRIES,\"delay_ms\":3000}" > /dev/null

while true; do
  RUNNING=$(curl -s "$BASE/api/precrawl/stats" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('crawl_jobs',{}).get('running',0))" 2>/dev/null)
  DONE=$(curl -s "$BASE/api/precrawl/stats" -H "Authorization: Bearer $TOKEN" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_companies',0))" 2>/dev/null)
  echo "  [$(date +%H:%M)] Running: $RUNNING | Companies: $DONE"
  if [ "$RUNNING" = "0" ]; then break; fi
  sleep 60
done
echo "Phase 4 DONE"

echo ""
echo "=== ALL PHASES COMPLETE ==="
echo "=== $(date) ==="
curl -s "$BASE/api/precrawl/stats" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
