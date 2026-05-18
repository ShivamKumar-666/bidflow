# BidFlow - Bid Management System

BidFlow is a comprehensive, modern, and professional bid management system designed to streamline the bidding process. It features a robust backend built with Python/Flask and a highly responsive, dynamic frontend using React and Vite.

## Features

- **User Authentication**: Secure user registration and login using JWT (JSON Web Tokens) and bcrypt password hashing.
- **Bid Management**: Create, view, and manage bids seamlessly.
- **Interactive Dashboard**: Data visualization and analytics powered by Chart.js.
- **Premium User Interface**: Modern design aesthetics, including dynamic gradients, custom scrollbars, smooth micro-animations, and professional toast notifications (using `react-hot-toast`).
- **Responsive Layout**: Designed to work across different screen sizes with a dark-theme focused premium feel.

## Technology Stack

### Frontend
- **Framework**: React 19 with Vite
- **Routing**: React Router DOM
- **HTTP Client**: Axios
- **Data Visualization**: Chart.js & react-chartjs-2
- **Icons**: Lucide React
- **Notifications**: React Hot Toast
- **Styling**: Vanilla CSS (Modern CSS features, custom variables, animations)

### Backend
- **Framework**: Python / Flask 3.0
- **Database**: MongoDB (via PyMongo)
- **Authentication**: Flask-JWT-Extended
- **Security**: bcrypt (password hashing), Flask-CORS

## Prerequisites

Before running the application, ensure you have the following installed:
- **Node.js & npm** (for the frontend)
- **Python 3.8+** (for the backend)
- **MongoDB** (running locally on the default port `27017`)

## Installation & Setup

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone <your-repository-url>
   cd bidflow
   ```

2. **Backend Setup**:
   Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   python -m venv venv
   # Activate the virtual environment
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   
   # Install dependencies
   pip install -r requirements.txt
   ```

3. **Frontend Setup**:
   Open a separate terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   npm install
   ```

## Running the Application

### The Easy Way (Windows)
We have included a single-click startup script for Windows users. Simply run the `start.bat` file located in the root directory:
```bash
./start.bat
```
This script will automatically activate the Python virtual environment, start the Flask backend, and launch the React frontend in separate terminal windows.

### Manual Startup
If you are not on Windows or prefer to start them manually:

**1. Start the Backend:**
```bash
cd backend
venv\Scripts\activate
flask run --port=5000
```
*The backend API will run on http://localhost:5000*

**2. Start the Frontend:**
```bash
cd frontend
npm run dev
```
*The frontend app will run on http://localhost:5173*

## End-to-End Testing

To test the end-to-end functionality of the backend flows, you can use the provided automated test script in the backend directory:
```bash
cd backend
venv\Scripts\activate
python test_flow.py
```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
