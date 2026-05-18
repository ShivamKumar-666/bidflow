import requests
import json

BASE_URL = "http://localhost:5000/api"

def run_test():
    print("Starting BidFlow API Test...\n")
    
    # 1. Register
    print("1. Testing Registration...")
    user_data = {
        "name": "Test User",
        "email": "testuser@bidflow.com",
        "password": "password123",
        "role": "Sales Executive"
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=user_data)
    if r.status_code == 201:
        print("   Registration successful!")
    elif r.status_code == 400 and "already exists" in r.text:
        print("   User already exists, proceeding to login...")
    else:
        print(f"   Registration failed: {r.text}")
        return

    # 2. Login
    print("\n2. Testing Login...")
    login_data = {
        "email": "testuser@bidflow.com",
        "password": "password123"
    }
    r = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    if r.status_code != 200:
        print(f"   Login failed: {r.text}")
        return
    token = r.json().get('access_token')
    headers = {"Authorization": f"Bearer {token}"}
    print("   Login successful! Token acquired.")

    # 3. Create Enquiry
    print("\n3. Testing Enquiry Creation...")
    enq_data = {
        "customerName": "Acme Corp",
        "contactInformation": "acme@example.com",
        "productServiceRequired": "10x Industrial Widgets",
        "priority": "High",
        "notes": "Urgent delivery required"
    }
    r = requests.post(f"{BASE_URL}/enquiries/", json=enq_data, headers=headers)
    if r.status_code != 201:
        print(f"   Create Enquiry failed: {r.text}")
        return
    enquiry_id = r.json().get('enquiryId')
    print(f"   Enquiry created successfully! ID: {enquiry_id}")

    # 4. Create Bid
    print("\n4. Testing Bid Creation...")
    bid_data = {
        "enquiryId": enquiry_id,
        "amount": 15000,
        "submissionDate": "2026-06-01",
        "assignedEmployee": "Test User",
        "remarks": "Discount applied for bulk order"
    }
    r = requests.post(f"{BASE_URL}/bids/", json=bid_data, headers=headers)
    if r.status_code != 201:
        print(f"   Create Bid failed: {r.text}")
        return
    bid_id = r.json().get('_id')
    print(f"   Bid created successfully! DB ID: {bid_id}")

    # 5. Update Bid Status
    print("\n5. Testing Bid Status Update...")
    status_data = {
        "status": "Order Received",
        "note": "Client accepted the offer"
    }
    r = requests.put(f"{BASE_URL}/bids/{bid_id}/status", json=status_data, headers=headers)
    if r.status_code != 200:
        print(f"   Update Bid Status failed: {r.text}")
        return
    print("   Bid status updated successfully to 'Order Received'!")

    # 6. Fetch Dashboard Metrics
    print("\n6. Testing Dashboard Analytics...")
    r = requests.get(f"{BASE_URL}/analytics/dashboard", headers=headers)
    if r.status_code != 200:
        print(f"   Fetch Dashboard failed: {r.text}")
        return
    print(f"   Dashboard Metrics: {json.dumps(r.json(), indent=2)}")

    print("\n✅ All tests passed successfully. The application is fully working with MongoDB!")

if __name__ == "__main__":
    try:
        run_test()
    except Exception as e:
        print(f"Test script failed: {e}")
