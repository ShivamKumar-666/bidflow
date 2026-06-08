"""
backend/ml/train.py
───────────────────
Retrains XGBoost model from combined_training_data.csv using best params.
"""

import os
import json
import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score, f1_score
from collections import Counter


def main():
    ml_dir = os.path.dirname(__file__)
    data_dir = os.path.join(os.path.dirname(ml_dir), '..', 'data')
    csv_path = os.path.join(data_dir, 'combined_training_data.csv')
    
    if not os.path.exists(csv_path):
        print(f"Error: Dataset not found at {csv_path}")
        return
    
    # Load best params
    best_params_path = os.path.join(ml_dir, 'best_params.json')
    if os.path.exists(best_params_path):
        with open(best_params_path, 'r') as f:
            best_params = json.load(f)
        print(f"Loaded best params: {best_params}")
    else:
        best_params = {
            'n_estimators': 200,
            'max_depth': 6,
            'learning_rate': 0.05,
            'min_child_weight': 3,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
        }
    
    # Load feature list
    feature_list_path = os.path.join(ml_dir, 'feature_list.json')
    if os.path.exists(feature_list_path):
        with open(feature_list_path, 'r') as f:
            FEATURES = json.load(f)
    else:
        FEATURES = [
            'amount', 'amount_log', 'days_to_deadline', 'deadline_urgency',
            'priority_encoded', 'employee_win_rate', 'employee_experience',
            'industry_win_rate', 'amount_vs_industry_avg', 'amount_x_win_rate',
            'industry_encoded', 'product_series_encoded', 'regional_office_encoded',
            'sales_price',
        ]
    
    print(f"Using {len(FEATURES)} features: {FEATURES}")
    
    df = pd.read_csv(csv_path)
    
    # Fix target leak
    np.random.seed(42)
    won_amounts = df[df['won'] == 1]['amount'].values
    if len(won_amounts) > 0:
        lost_mask = (df['won'] == 0)
        df.loc[lost_mask, 'amount'] = np.random.choice(won_amounts, size=lost_mask.sum())
        if 'amount_log' in df.columns:
            df.loc[lost_mask, 'amount_log'] = np.log1p(df.loc[lost_mask, 'amount'])
    
    X = df[FEATURES]
    y = df['won']
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Calculate scale_pos_weight
    counter = Counter(y_train)
    scale_pos_weight = counter[0] / counter[1] if counter[1] > 0 else 1.0
    
    model = xgb.XGBClassifier(
        **best_params,
        scale_pos_weight=scale_pos_weight,
        eval_metric='logloss',
        random_state=42,
        n_jobs=-1,
    )
    
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    
    acc = accuracy_score(y_test, y_pred)
    roc_auc = roc_auc_score(y_test, y_prob)
    
    print(f"\nAccuracy: {acc:.4f} ({acc*100:.1f}%)")
    print(f"ROC-AUC:  {roc_auc:.4f}")
    print(f"\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=['Lost', 'Won']))
    
    joblib.dump(model, os.path.join(ml_dir, 'bid_model.pkl'))
    print("Model saved.")


if __name__ == "__main__":
    main()
