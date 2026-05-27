import os
import sys

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import create_app
from database import db
from bson import ObjectId
from flask import render_template
import datetime
from io import BytesIO
from xhtml2pdf import pisa

app = create_app()
with app.app_context():
    try:
        bid = db.Bids.find_one()
        if not bid:
            print("No bids found in database!")
            sys.exit(1)
        print("Testing with bid:", bid["bidId"])
        
        enquiry = db.Enquiries.find_one({"enquiryId": bid.get("enquiryId")})
        if not enquiry:
            print("No parent enquiry found, using empty mock")
            enquiry = {}
        
        amount = bid.get("amount", 0)
        product_service = enquiry.get("productServiceRequired", "Product / Service Delivery") if enquiry else "Delivery"
        
        items = [
            {
                "name": f"Core Delivery: {product_service}",
                "description": "Primary deployment, customized configuration, and core execution.",
                "qty": 1,
                "price": amount * 0.80,
                "total": amount * 0.80
            }
        ]
        
        date_str = datetime.datetime.now().strftime("%B %d, %Y")
        
        # Try to render HTML
        print("Rendering template...")
        html_content = render_template(
            'quotation_template.html',
            bid=bid,
            enquiry=enquiry,
            items=items,
            date_str=date_str
        )
        print("HTML rendered successfully! Length:", len(html_content))
        
        # Try to convert to PDF
        print("Converting to PDF...")
        pdf_buffer = BytesIO()
        pisa_status = pisa.CreatePDF(html_content, dest=pdf_buffer)
        
        if pisa_status.err:
            print("pisa_status.err is True! PDF conversion failed.")
        else:
            pdf_buffer.seek(0)
            pdf_data = pdf_buffer.read()
            print("PDF generated successfully! Length:", len(pdf_data))
            
    except Exception as e:
        import traceback
        print("An error occurred during quotation generation:")
        traceback.print_exc()
