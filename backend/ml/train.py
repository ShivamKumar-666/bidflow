import os
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import joblib

def main():
    ml_dir = os.path.dirname(__file__)
    datasets_dir = os.path.join(ml_dir, 'datasets')
    csv_path = os.path.join(datasets_dir, 'combined_training_data.csv')
    
    if not os.path.exists(csv_path):
        print(f"Error: Dataset not found at {csv_path}")
        return
        
    df = pd.read_csv(csv_path)
    
    # Recreate industry encoder to save it alongside the model
    le_industry = LabelEncoder()
    df['industry_encoded'] = le_industry.fit_transform(df['industry'])
    
    features = ['amount', 'days_to_deadline', 'priority_encoded', 'employee_win_rate', 'is_repeat_customer', 'industry_encoded']
    X = df[features]
    y = df['won']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    model = LogisticRegression(max_iter=2000)
    model.fit(X_train, y_train)
    
    acc = model.score(X_test, y_test)
    print(f"Model trained on {len(df)} unified records. Test accuracy: {acc:.2f}")
    
    joblib.dump(model, os.path.join(ml_dir, 'bid_model.pkl'))
    joblib.dump(le_industry, os.path.join(ml_dir, 'industry_encoder.pkl'))
    print("Model and encoders updated and saved.")

if __name__ == "__main__":
    main()
