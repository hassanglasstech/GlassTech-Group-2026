# GLASSCO — BASELINE METRICS (from backup 2026-07-09)

Source: `Glasstech_ERP_BACKUP_2026-07-09_AUTO (6).json` (Glassco slice).
All figures computed over the full dataset. Dates = order date (Glassco cuts to order).
**July 2026 is a PARTIAL month** (backup taken 9-Jul) — do not read as a full month.

## Sales — approved orders, per month
| Month | Orders | Net Sales (PKR) | SqFt |
|---|--:|--:|--:|
| 2025-12 | 1 | 28,000 | 80 |
| 2026-01 | 20 | 2,654,900 | 4,628 |
| 2026-02 | 50 | 6,779,916 | 11,357 |
| 2026-03 | 46 | 4,130,297 | 9,129 |
| 2026-04 | 17 | 1,733,476 | 3,923 |
| 2026-05 | 88 | 13,987,205 | 20,540 |
| 2026-06 | 97 | 20,498,493 | 22,909 |
| 2026-07* | 36 | 7,173,822 | 13,966 |
| **TOTAL** | **355** | **56,986,109** | **86,531** |

Draft pipeline (not sales): 24,808,376 across 226 quotes.

## Production — pieces cut, per month
| Month | Pieces | SqFt cut |
|---|--:|--:|
| 2025-12 | 7 | 80 |
| 2026-01 | 238 | 4,587 |
| 2026-02 | 736 | 13,546 |
| 2026-03 | 616 | 12,339 |
| 2026-04 | 235 | 6,886 |
| 2026-05 | 1,076 | 24,574 |
| 2026-06 | 1,309 | 25,341 |
| 2026-07* | 729 | 20,349 |
| **TOTAL** | **4,946** | **107,701** |

## Avg per-day cutting (Dec 2025 → Jul 2026)
- Per active production day (103 days): **~48 pieces / ~1,046 sqft**
- Per calendar day (195-day span): ~25 pieces / ~552 sqft
- Per month (avg): **~618 pieces / ~13,463 sqft**

## By glass thickness — ordered vs cut
| mm | Ordered SqFt | Ord pcs | Cut SqFt | Cut pcs |
|---|--:|--:|--:|--:|
| 5mm | 8,342 | 552 | 8,389 | 557 |
| 6mm | 29,814 | 1,296 | **48,148** | 1,783 |
| 8mm | 21,693 | 1,338 | 21,787 | 1,312 |
| 10mm | 2,342 | 111 | 2,342 | 111 |
| 12mm | 24,179 | 1,050 | 26,874 | 1,175 |
| 19mm | 48 | 1 | 48 | 1 |

Cut pieces (4,946) exceed ordered (~4,355) by ~14% → recuts/breakage/revisions (6mm worst: +487 pcs).

## Labour cost per sqft @ 525,000/month salaries
Volume-driven (fixed cost spread over sqft):
| Volume basis | PKR/sqft |
|---|--:|
| Avg full month (~14,500 sqft) | **~36** |
| Peak run-rate (~25,000 sqft) | ~21 |
| Slow month (~6,900 sqft) | ~76 |
- Break-even to recover labour @ 25/sqft → must cut **~21,000 sqft/month**.
- LABOUR ONLY — full cost also needs glass material (not in backup) + tempering + utilities + wastage.

## Financial caveat
Backup is OPERATIONAL, not financial: only 1 payment (₨200) + 2 delivery dates in 582 orders; 99% pieces still WIP (51/4,946 delivered); stock value 0. **Accounting opening balances must come from the accountant's books, not this file.**
