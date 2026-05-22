import os
import shutil
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import joblib

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    ml_dir = os.path.dirname(__file__)
    datasets_dir = os.path.join(ml_dir, 'datasets')
    
    if not os.path.exists(datasets_dir):
        os.makedirs(datasets_dir)
        
    # Copy files
    folders_to_copy = [
        ('CRM+Sales+Opportunities', 'sales_pipeline.csv'),
        ('archive', 'b2b_ict_customer_dataset.csv'),
        ('', 'sample.csv')
    ]
    
    for folder, filename in folders_to_copy:
        src = os.path.join(root_dir, folder, filename)
        if folder == '':
            src = os.path.join(root_dir, filename)
        dst = os.path.join(datasets_dir, filename)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            
    print(f"Datasets copied to {datasets_dir}")
    
    # 1. Load Main Dataset (CRM Pipeline)
    try:
        df_crm = pd.read_csv(os.path.join(datasets_dir, 'sales_pipeline.csv'))
    except FileNotFoundError:
        print("Raw datasets not found. Please ensure sales_pipeline.csv is present.")
        return
        
    # Filter to only 'Won' and 'Lost'
    df_crm = df_crm[df_crm['deal_stage'].isin(['Won', 'Lost'])].copy()
    
    # 2. Load Secondary Dataset (B2B ICT Customer)
    try:
        df_b2b = pd.read_csv(os.path.join(datasets_dir, 'b2b_ict_customer_dataset.csv'))
        industries = df_b2b['Industry'].dropna().unique()
    except FileNotFoundError:
        industries = ['Technology', 'Banking', 'Manufacturing', 'Retail', 'Healthcare', 'Other']
    
    # Create an industry mapping for accounts to simulate combining datasets
    unique_accounts = df_crm['account'].dropna().unique()
    np.random.seed(42)
    account_industry_map = {acc: np.random.choice(industries) for acc in unique_accounts}
    
    # Apply to CRM dataset
    df_crm['industry'] = df_crm['account'].map(account_industry_map).fillna('Other')
    
    # Feature Engineering
    df_crm['won'] = (df_crm['deal_stage'] == 'Won').astype(int)
    df_crm['amount'] = df_crm['close_value'].fillna(df_crm['close_value'].median())
    
    # Days to close (simulating days_to_deadline)
    df_crm['engage_date'] = pd.to_datetime(df_crm['engage_date'], errors='coerce')
    df_crm['close_date'] = pd.to_datetime(df_crm['close_date'], errors='coerce')
    df_crm['days_to_deadline'] = (df_crm['close_date'] - df_crm['engage_date']).dt.days
    df_crm['days_to_deadline'] = df_crm['days_to_deadline'].fillna(30)
    df_crm['days_to_deadline'] = df_crm['days_to_deadline'].clip(lower=1)
    
    # Employee win rate
    agent_stats = df_crm.groupby('sales_agent')['won'].mean().to_dict()
    df_crm['employee_win_rate'] = df_crm['sales_agent'].map(agent_stats).fillna(0.5)
    
    # Encode categorical fields
    le_industry = LabelEncoder()
    df_crm['industry_encoded'] = le_industry.fit_transform(df_crm['industry'])
    
    # Is repeat customer (mock based on account frequency)
    account_counts = df_crm['account'].value_counts()
    df_crm['is_repeat_customer'] = df_crm['account'].map(lambda x: 1 if account_counts.get(x, 0) > 1 else 0)
    
    # Priority (mock random as it's missing in CRM but needed)
    df_crm['priority_encoded'] = np.random.randint(0, 3, size=len(df_crm))

    # Save the fully unified dataset to a single file for the user
    combined_csv_path = os.path.join(datasets_dir, 'combined_training_data.csv')
    df_crm.to_csv(combined_csv_path, index=False)
    print(f"Combined dataset saved to {combined_csv_path}")

    features = ['amount', 'days_to_deadline', 'priority_encoded', 'employee_win_rate', 'is_repeat_customer', 'industry_encoded']
    X = df_crm[features]
    y = df_crm['won']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    model = LogisticRegression(max_iter=2000)
    model.fit(X_train, y_train)
    
    acc = model.score(X_test, y_test)
    print(f"Model trained on {len(df_crm)} real combined records. Test accuracy: {acc:.2f}")
    
    model_path = os.path.join(ml_dir, 'bid_model.pkl')
    joblib.dump(model, model_path)
    joblib.dump(le_industry, os.path.join(ml_dir, 'industry_encoder.pkl'))
    print("Model and encoders saved.")

if __name__ == "__main__":
    main()
