from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
import bcrypt
from database import db
from datetime import timedelta

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    role = data.get('role', 'Sales Executive')

    if not email or not password or not name:
        return jsonify({"msg": "Missing required fields"}), 400

    if db.Users.find_one({"email": email}):
        return jsonify({"msg": "Email already exists"}), 400

    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    
    user = {
        "name": name,
        "email": email,
        "password": hashed_password.decode('utf-8'),
        "role": role
    }
    db.Users.insert_one(user)
    
    return jsonify({"msg": "User created successfully"}), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    user = db.Users.find_one({"email": email})
    if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        return jsonify({"msg": "Bad email or password"}), 401

    access_token = create_access_token(identity=str(user['_id']), additional_claims={"role": user['role']})
    return jsonify(access_token=access_token, user={"name": user['name'], "email": user['email'], "role": user['role']}), 200

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    current_user_id = get_jwt_identity()
    from bson.objectid import ObjectId
    user = db.Users.find_one({"_id": ObjectId(current_user_id)}, {"password": 0})
    if user:
        user['_id'] = str(user['_id'])
        return jsonify(user), 200
    return jsonify({"msg": "User not found"}), 404
