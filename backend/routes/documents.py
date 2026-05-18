from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename
import os
import datetime
from database import db
from bson.objectid import ObjectId

documents_bp = Blueprint('documents', __name__)

ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@documents_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_file():
    if 'file' not in request.files:
        return jsonify({"msg": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"msg": "No selected file"}), 400
        
    bid_id = request.form.get('bidId')
    if not bid_id:
        return jsonify({"msg": "bidId is required"}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Create a unique filename based on time
        unique_filename = f"{datetime.datetime.utcnow().timestamp()}_{filename}"
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)
        
        document = {
            "bidId": bid_id,
            "filename": filename,
            "path": unique_filename,
            "uploadDate": datetime.datetime.utcnow()
        }
        db.Documents.insert_one(document)
        document['_id'] = str(document['_id'])
        return jsonify(document), 201
        
    return jsonify({"msg": "File type not allowed"}), 400

@documents_bp.route('/download/<filename>', methods=['GET'])
@jwt_required()
def download_file(filename):
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], filename)

@documents_bp.route('/bid/<bid_id>', methods=['GET'])
@jwt_required()
def get_bid_documents(bid_id):
    docs = list(db.Documents.find({"bidId": bid_id}))
    for doc in docs:
        doc['_id'] = str(doc['_id'])
    return jsonify(docs), 200
