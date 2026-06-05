import pandas as pd

sp = pd.read_csv('data/sales_pipeline.csv')
acc = pd.read_csv('data/accounts.csv')
products = pd.read_csv('data/products.csv')
teams = pd.read_csv('data/sales_teams.csv')

filtered = sp[sp['deal_stage'].isin(['Won', 'Lost'])]

print('=== Class Balance ===')
print(filtered['deal_stage'].value_counts())
won_pct = (filtered['deal_stage'] == 'Won').mean()
lost_pct = (filtered['deal_stage'] == 'Lost').mean()
print(f'Won: {won_pct:.2%}')
print(f'Lost: {lost_pct:.2%}')

print('\n=== Sectors in accounts.csv ===')
print(acc['sector'].value_counts())

print('\n=== Products ===')
print(products)

print('\n=== Sales Teams ===')
print(teams.head(10))

print('\n=== Join Test ===')
merged = filtered.merge(acc[['account', 'sector']], on='account', how='left')
print(f'Matched sectors: {merged["sector"].notna().sum()} / {len(merged)}')
print(merged[['account', 'sector', 'deal_stage', 'close_value']].head(15))

print('\n=== Sector Win Rates ===')
sector_wr = merged.groupby('sector')['deal_stage'].apply(lambda x: (x == 'Won').mean())
print(sector_wr.sort_values(ascending=False))

print('\n=== Product Series ===')
merged2 = merged.merge(products[['product', 'series']], on='product', how='left')
print(merged2['series'].value_counts())
