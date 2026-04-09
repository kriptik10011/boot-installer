import json, sys

data = json.load(sys.stdin)
rows = data.get('daily', data.get('rows', data))
if isinstance(rows, dict):
    rows = list(rows.values())

print(f"{'Date':<12} {'Tokens':>14} {'Cost':>10}")
print("-" * 38)
total_tokens = 0
total_cost = 0.0
for r in rows:
    date = r.get('date', r.get('period', ''))
    tokens = r.get('totalTokens', 0)
    cost = r.get('totalCost', 0)
    if tokens == 0 and cost == 0:
        continue
    total_tokens += tokens
    total_cost += cost
    print(f"{date:<12} {tokens:>14,} ${cost:>8.2f}")
print("-" * 38)
print(f"{'TOTAL':<12} {total_tokens:>14,} ${total_cost:>8.2f}")
