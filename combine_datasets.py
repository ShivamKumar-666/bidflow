"""
combine_datasets.py
───────────────────
Combines all data sources into a single unified training dataset.

Sources:
  - data/sales_pipeline.csv  (8800 records, main CRM data)
  - data/accounts.csv        (85 accounts with sector/industry)
  - data/products.csv        (7 products with series and price)
  - data/sales_teams.csv     (35 sales agents with manager/region)

Output:
  - data/combined_training_data.csv
  
Features engineered:
  - won (target): 1 if deal_stage == 'Won', 0 if 'Lost'
  - amount: close_value (with target leak fix for Lost deals)
  - amount_log: log1p(amount)
  - days_to_deadline: (close_date - engage_date).days
  - deadline_urgency: 2=urgent(<7d), 1=normal(7-30d), 0=relaxed(>30d)
  - priority_encoded: amount percentile bucket (0=small, 1=medium, 2=large)
  - employee_win_rate: per-agent historical win rate
  - employee_experience: total bids per agent
  - is_repeat_customer: 1 if account appears >1 time
  - industry: from accounts.csv sector field
  - industry_encoded: LabelEncoder on industry
  - industry_win_rate: per-industry historical win rate
  - amount_vs_industry_avg: amount / industry_mean
  - amount_x_win_rate: interaction feature
  - product_series: from products.csv
  - product_series_encoded: LabelEncoder on series
  - sales_price: suggested retail price from products.csv
"""

import os
import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(root_dir, 'data')
    ml_dir = os.path.join(root_dir, 'backend', 'ml')
    
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
    
    # Load all datasets
    print("Loading datasets...")
    sp = pd.read_csv(os.path.join(data_dir, 'sales_pipeline.csv'))
    acc = pd.read_csv(os.path.join(data_dir, 'accounts.csv'))
    products = pd.read_csv(os.path.join(data_dir, 'products.csv'))
    teams = pd.read_csv(os.path.join(data_dir, 'sales_teams.csv'))
    
    print(f"  sales_pipeline: {len(sp)} records")
    print(f"  accounts: {len(acc)} records")
    print(f"  products: {len(products)} records")
    print(f"  sales_teams: {len(teams)} records")
    
    # Filter to Won/Lost only
    df = sp[sp['deal_stage'].isin(['Won', 'Lost'])].copy()
    print(f"\nFiltered to {len(df)} Won/Lost records")
    
    # Join with accounts to get real industry (sector)
    df = df.merge(acc[['account', 'sector']], on='account', how='left')
    df['industry'] = df['sector'].fillna('Other')
    matched = df['sector'].notna().sum()
    print(f"  Matched {matched}/{len(df)} accounts to industry")
    
    # Join with products to get series and sales_price
    df = df.merge(products[['product', 'series', 'sales_price']], on='product', how='left')
    df['product_series'] = df['series'].fillna('Other')
    df['sales_price'] = df['sales_price'].fillna(0)
    
    # Join with sales_teams to get regional_office
    df = df.merge(teams[['sales_agent', 'regional_office']], on='sales_agent', how='left')
    df['regional_office'] = df['regional_office'].fillna('Unknown')
    
    # Target variable
    df['won'] = (df['deal_stage'] == 'Won').astype(int)
    
    # Fix target leak: Lost deals have close_value = 0
    # Sample from Won distribution for realistic amounts
    np.random.seed(42)
    won_amounts = df[df['won'] == 1]['close_value'].values
    if len(won_amounts) > 0:
        lost_mask = (df['won'] == 0)
        df.loc[lost_mask, 'close_value'] = np.random.choice(won_amounts, size=lost_mask.sum())
    
    # Amount features
    df['amount'] = df['close_value']
    df['amount_log'] = np.log1p(df['amount'])
    
    # Days to deadline
    df['engage_date'] = pd.to_datetime(df['engage_date'], errors='coerce')
    df['close_date'] = pd.to_datetime(df['close_date'], errors='coerce')
    df['days_to_deadline'] = (df['close_date'] - df['engage_date']).dt.days
    df['days_to_deadline'] = df['days_to_deadline'].fillna(30).clip(lower=1)
    
    # Deadline urgency
    def urgency(days):
        if days < 7: return 2
        elif days < 30: return 1
        else: return 0
    df['deadline_urgency'] = df['days_to_deadline'].apply(urgency)
    
    # Priority encoded (amount percentile)
    df['priority_encoded'] = pd.qcut(df['amount'], q=3, labels=[0, 1, 2]).astype(int)
    
    # Employee win rate (from actual outcomes)
    agent_stats = df.groupby('sales_agent')['won'].mean().to_dict()
    df['employee_win_rate'] = df['sales_agent'].map(agent_stats).fillna(0.5)
    
    # Employee experience (total bids handled)
    emp_counts = df.groupby('sales_agent')['opportunity_id'].count().to_dict()
    df['employee_experience'] = df['sales_agent'].map(emp_counts).fillna(1)
    
    # Is repeat customer
    account_counts = df['account'].value_counts()
    df['is_repeat_customer'] = df['account'].map(lambda x: 1 if account_counts.get(x, 0) > 1 else 0)
    
    # Industry win rate
    industry_wr = df.groupby('industry')['won'].mean().to_dict()
    df['industry_win_rate'] = df['industry'].map(industry_wr).fillna(df['won'].mean())
    
    # Amount vs industry average
    industry_avg = df.groupby('industry')['amount'].mean()
    df['amount_vs_industry_avg'] = df['amount'] / df['industry'].map(industry_avg)
    df['amount_vs_industry_avg'] = df['amount_vs_industry_avg'].fillna(1.0)
    
    # Interaction feature
    df['amount_x_win_rate'] = df['amount_log'] * df['employee_win_rate']
    
    # Encode categoricals
    le_industry = LabelEncoder()
    df['industry_encoded'] = le_industry.fit_transform(df['industry'])
    
    le_series = LabelEncoder()
    df['product_series_encoded'] = le_series.fit_transform(df['product_series'])
    
    le_region = LabelEncoder()
    df['regional_office_encoded'] = le_region.fit_transform(df['regional_office'])
    
    # Save combined dataset
    output_path = os.path.join(data_dir, 'combined_training_data.csv')
    df.to_csv(output_path, index=False)
    print(f"\nCombined dataset saved to: {output_path}")
    print(f"Total records: {len(df)}")
    print(f"Features: {len(df.columns)}")
    
    # Print class balance
    print(f"\nClass balance:")
    print(f"  Won:  {(df['won']==1).sum()} ({(df['won']==1).mean():.2%})")
    print(f"  Lost: {(df['won']==0).sum()} ({(df['won']==0).mean():.2%})")
    
    # Print feature summary
    print(f"\nFeature columns:")
    feature_cols = [
        'amount', 'amount_log', 'days_to_deadline', 'deadline_urgency',
        'priority_encoded', 'employee_win_rate', 'employee_experience',
        'is_repeat_customer', 'industry_win_rate', 'amount_vs_industry_avg',
        'amount_x_win_rate', 'industry_encoded', 'product_series_encoded',
        'regional_office_encoded', 'sales_price'
    ]
    for col in feature_cols:
        if col in df.columns:
            print(f"  {col}: mean={df[col].mean():.2f}, std={df[col].std():.2f}")
    
    # Save encoders
    import joblib
    joblib.dump(le_industry, os.path.join(ml_dir, 'industry_encoder.pkl'))
    joblib.dump(le_series, os.path.join(ml_dir, 'series_encoder.pkl'))
    joblib.dump(le_region, os.path.join(ml_dir, 'region_encoder.pkl'))
    print(f"\nEncoders saved to {ml_dir}")

if __name__ == "__main__":
    main()
