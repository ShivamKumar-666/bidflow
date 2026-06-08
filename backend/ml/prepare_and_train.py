"""
backend/ml/prepare_and_train.py
───────────────────────────────
Initial ML model training with all improvements:
  1. scale_pos_weight for class imbalance
  2. SMOTE oversampling
  3. 11+ high-signal features
  4. GridSearchCV hyperparameter tuning
  5. Real industry data from accounts.csv
  
Output:
  - bid_model.pkl (best XGBoost model)
  - industry_encoder.pkl
  - best_params.json (for retrain.py to use)
"""

import os
import sys
import json
import datetime
import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
from sklearn.model_selection import train_test_split, GridSearchCV, StratifiedKFold
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score, f1_score, balanced_accuracy_score
from collections import Counter

# Add parent directory to path for config import
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

try:
    from imblearn.over_sampling import SMOTE
    HAS_SMOTE = True
except ImportError:
    HAS_SMOTE = False
    print("WARNING: imbalanced-learn not installed. SMOTE will be skipped.")
    print("Install with: pip install imbalanced-learn")

try:
    from pymongo import MongoClient
    from config import Config
    HAS_MONGO = True
except ImportError:
    HAS_MONGO = False


def main():
    ml_dir = os.path.dirname(__file__)
    data_dir = os.path.join(os.path.dirname(ml_dir), '..', 'data')
    csv_path = os.path.join(data_dir, 'combined_training_data.csv')
    
    if not os.path.exists(csv_path):
        print(f"Error: Dataset not found at {csv_path}")
        print("Run combine_datasets.py first.")
        return
    
    print("Loading combined dataset...")
    df = pd.read_csv(csv_path)
    print(f"  Records: {len(df)}")
    print(f"  Won: {(df['won']==1).sum()} ({(df['won']==1).mean():.2%})")
    print(f"  Lost: {(df['won']==0).sum()} ({(df['won']==0).mean():.2%})")
    
    # Define feature list (11 core features + extras)
    FEATURES = [
        'amount',
        'amount_log',
        'days_to_deadline',
        'deadline_urgency',
        'priority_encoded',
        'employee_win_rate',
        'employee_experience',
        'industry_win_rate',
        'amount_vs_industry_avg',
        'amount_x_win_rate',
        'industry_encoded',
    ]
    
    # Optional features (include if available)
    OPTIONAL_FEATURES = [
        'product_series_encoded',
        'regional_office_encoded',
        'sales_price',
    ]
    
    # Use only features that exist in the dataframe
    available_features = [f for f in FEATURES if f in df.columns]
    available_optional = [f for f in OPTIONAL_FEATURES if f in df.columns]
    all_features = available_features + available_optional
    
    print(f"\nUsing {len(all_features)} features:")
    for f in all_features:
        print(f"  - {f}")
    
    X = df[all_features]
    y = df['won']
    
    # Train/test split (stratified)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    print(f"\nTrain: {len(X_train)}, Test: {len(X_test)}")
    
    # Calculate scale_pos_weight for class imbalance
    counter = Counter(y_train)
    scale_pos_weight = counter[0] / counter[1]
    print(f"\nClass imbalance ratio (scale_pos_weight): {scale_pos_weight:.3f}")
    
    # Apply SMOTE if available (mild oversampling to avoid overfitting)
    if HAS_SMOTE:
        print("\nApplying mild SMOTE oversampling (k_neighbors=3)...")
        sm = SMOTE(random_state=42, k_neighbors=3)
        X_train_res, y_train_res = sm.fit_resample(X_train, y_train)
        print(f"  After SMOTE - Train: {len(X_train_res)}")
        print(f"  Won: {(y_train_res==1).sum()}, Lost: {(y_train_res==0).sum()}")
    else:
        X_train_res, y_train_res = X_train, y_train
    
    # GridSearchCV for hyperparameter tuning
    print("\nRunning GridSearchCV (this may take 2-5 minutes)...")
    
    # Conservative grid to avoid overfitting - target 80-90% accuracy
    param_grid = {
        'n_estimators': [50, 100, 150],
        'max_depth': [3, 4, 5],
        'learning_rate': [0.05, 0.1],
        'min_child_weight': [5, 7, 10],
        'gamma': [0, 0.1, 0.2],
        'subsample': [0.7, 0.8],
        'colsample_bytree': [0.7, 0.8],
        'reg_alpha': [0, 0.1, 1.0],
        'reg_lambda': [1.0, 2.0, 5.0],
    }
    
    base_model = xgb.XGBClassifier(
        scale_pos_weight=scale_pos_weight,
        use_label_encoder=False,
        eval_metric='logloss',
        random_state=42,
        n_jobs=-1,
    )
    
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    
    # Use balanced_accuracy to avoid overfitting on majority class
    grid_search = GridSearchCV(
        base_model,
        param_grid,
        cv=cv,
        scoring='balanced_accuracy',
        n_jobs=-1,
        verbose=1,
    )
    
    grid_search.fit(X_train_res, y_train_res)
    
    print(f"\nBest params: {grid_search.best_params_}")
    print(f"Best F1 score: {grid_search.best_score_:.4f}")
    
    # Save best params
    best_params_path = os.path.join(ml_dir, 'best_params.json')
    with open(best_params_path, 'w') as f:
        json.dump(grid_search.best_params_, f, indent=2)
    print(f"Best params saved to {best_params_path}")
    
    # Use best model
    model = grid_search.best_estimator_
    
    # Evaluate on test set
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    
    acc = accuracy_score(y_test, y_pred)
    bal_acc = balanced_accuracy_score(y_test, y_pred)
    roc_auc = roc_auc_score(y_test, y_prob)
    f1_lost = f1_score(y_test, y_pred, pos_label=0)
    f1_won = f1_score(y_test, y_pred, pos_label=1)
    
    print(f"\n{'='*60}")
    print(f"FINAL MODEL PERFORMANCE")
    print(f"{'='*60}")
    print(f"Overall Accuracy:      {acc:.4f} ({acc*100:.1f}%)")
    print(f"Balanced Accuracy:     {bal_acc:.4f} ({bal_acc*100:.1f}%)")
    print(f"ROC-AUC Score:         {roc_auc:.4f}")
    print(f"F1 (Lost class):       {f1_lost:.4f}")
    print(f"F1 (Won class):        {f1_won:.4f}")
    print(f"\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=['Lost', 'Won']))
    
    # Warn if accuracy is suspiciously high (possible overfitting)
    if bal_acc > 0.90:
        print(f"\n[WARNING] Balanced Accuracy {bal_acc*100:.1f}% exceeds 90% - possible overfitting!")
        print("   Consider reducing model complexity or adding more regularization.")
    elif bal_acc < 0.75:
        print(f"\n[WARNING] Balanced Accuracy {bal_acc*100:.1f}% is below 75% - model may be underfitting!")
    else:
        print(f"\n[OK] Balanced Accuracy {bal_acc*100:.1f}% is in acceptable range (75-90%)")
    
    # Save model and encoders
    joblib.dump(model, os.path.join(ml_dir, 'bid_model.pkl'))
    print(f"\nModel saved to {ml_dir}/bid_model.pkl")
    
    # Save feature list for inference
    feature_list_path = os.path.join(ml_dir, 'feature_list.json')
    with open(feature_list_path, 'w') as f:
        json.dump(all_features, f, indent=2)
    print(f"Feature list saved to {feature_list_path}")
    
    print(f"\n{'='*60}")
    print("TRAINING COMPLETE")
    print(f"{'='*60}")
    
    # Register model in MongoDB ModelVersions collection for dashboard visibility
    if HAS_MONGO:
        try:
            client = MongoClient(Config.MONGO_URI, serverSelectionTimeoutMS=3000)
            client.admin.command('ping')
            db = client.get_default_database()
            if db is None:
                db = client['bidflow']
            
            # Deactivate any existing versions
            db.ModelVersions.update_many({}, {"$set": {"isActive": False}})
            
            # Insert new model version (only include fields with actual values)
            db.ModelVersions.insert_one({
                "version": 1,
                "isActive": True,
                "accuracy": bal_acc,
                "records": len(df),
                "trainedAt": datetime.datetime.now(datetime.timezone.utc),
            })
            
            print(f"\nModel registered in MongoDB ModelVersions (version 1, accuracy: {bal_acc*100:.1f}%)")
            client.close()
        except Exception as e:
            print(f"\n[WARNING] Could not register model in MongoDB: {e}")
            print("   Model saved to disk but dashboard may show 'No model trained yet'.")
            print("   Run: python ml/backfill_model_version.py to backfill.")


if __name__ == "__main__":
    main()
