# Onboarding Automation Design

**Target:** New client setup in < 4 hours (from current 40+ hours manual)

---

## 7-Step Automated Onboarding

| Step | Time | Manual | Automated |
|---|---|---|---|
| 1. Company Profile | 15 min | Owner fills form | OnboardingAgent creates settings |
| 2. Chart of Accounts | 2 hours | Accountant builds | Industry COA template (IAS 1) |
| 3. Master Data Import | 4 hours | Manual entry | CSV upload + validation |
| 4. EventOS Patterns | 2 hours | Manual creation | 8 patterns auto-loaded |
| 5. Business Manual | 8 hours | Document writing | Chat-based interview |
| 6. Agent Training | 8 hours | Data review | Auto-scan uploaded files |
| 7. Go-Live Test | 2 hours | Manual testing | First event: "tanker aaya" |
| **Total** | **26+ hours** | | **< 4 hours** |

## OnboardingAgent Capabilities

1. **Industry Detection:** Glass, steel, textile, marble → loads matching COA + patterns
2. **COA Generation:** 200+ GL accounts from IAS 1 template, customized by industry
3. **CSV Validator:** Checks clients, vendors, products, opening balances
4. **Pattern Customization:** Swaps keywords by industry (glass→shesha, steel→loha)
5. **Business Manual Interview:** Asks owner 10 questions in Roman Urdu → generates manual
6. **Knowledge Bootstrap:** Scans uploaded invoices/POs → extracts vendor names, product categories
7. **Go-Live Checklist:** Period setup, user accounts, RLS verification, first event test

## Success Metrics

| Metric | Target |
|---|---|
| Time to first event | < 4 hours |
| Owner satisfaction | 8/10+ |
| Agent accuracy (first 10) | 70%+ |
| Data import errors | < 5% |
