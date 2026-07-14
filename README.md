
🐾 PawRescue AI - Animal Rescue Assistant


An intelligent animal rescue system powered by AI that helps identify injured animals, assess injury severity, and locate nearest rescue facilities.

** Table of Contents**
Features
Demo
Architecture
Prerequisites
Installation
Running the Application
Project Structure
API Documentation
Usage Guide
Troubleshooting
Contributing
License
 **Features**
 **AI-Powered Analysis**
Species Detection: Automatically identifies dogs, cats, birds, and other animals
Injury Assessment: Analyzes severity levels (Critical, Urgent, Mild)
Wound Recognition: Detects visible injuries and conditions
Confidence Scoring: Provides AI confidence percentage for transparency
 **Location Services**
Auto-Location Detection: Automatically captures user's GPS coordinates
Nearest Facilities: Shows top 3 closest rescue centers/hospitals
Distance Calculation: Real-time distance calculation to help centers
Google Maps Integration: Direct navigation links to facilities
 **Modern UI/UX**
Glassmorphism Design: Beautiful glass-effect cards
Smooth Animations: Engaging transitions and micro-interactions
Responsive Layout: Works on desktop, tablet, and mobile
Dark Mode: Eye-friendly dark theme with animated gradients
 **Report Management**
Report History: Track all submitted rescue reports
Photo Gallery: Visual timeline of rescued animals
Export Capability: Download reports for record-keeping
Real-time Updates: Live status of rescue operations
** Demo**

Main Dashboard

┌─────────────────────────────────────────┐
│  🐾 PawRescue AI                        │
│  Saving Lives with Intelligence         │
└─────────────────────────────────────────┘
│                                           │
│  [Upload Photo]  [Analysis Results]      │
│                                           │
│  Species: Dog                             │
│  Severity: Critical 🚨                  │
│  Confidence: 87.5%                        │
│                                           │
│  Nearest Help Centers:                    │
│  1. Central Animal Hospital (2.3 km)     │
│  2. Emergency Vet Clinic (3.7 km)        │
│  3. Rescue Center (5.1 km)               │
└───────────────────────────────────────────┘
 **Architecture**
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Frontend   │◄─────►│   Backend    │◄─────►│  AI Service  │
│  (React +    │       │  (Node.js +  │       │  (Python +   │
│   Vite)      │       │   Express)   │       │   FastAPI)   │
└──────────────┘       └──────────────┘       └──────────────┘
      │                       │                       │
      │                       │                       │
      ▼                       ▼                       ▼
  Port 5173              Port 5000               Port 8001
Technology Stack
Frontend
React 18.2 - UI Library
Vite 4.3 - Build Tool
CSS3 - Styling with animations
Geolocation API - Location services
Backend
Node.js 18+ - Runtime
Express 4.18 - Web Framework
Axios - HTTP Client
CORS - Cross-origin handling
AI Service
Python 3.8+ - Language
FastAPI - API Framework
Pillow (PIL) - Image Processing
NumPy - Mathematical Operations
 **Prerequisites**
Before you begin, ensure you have the following installed:

Required Software
Software	Version	Download Link
Node.js	18.x or higher	nodejs.org
Python	3.8 or higher	python.org
npm	9.x or higher	(included with Node.js)
pip	Latest	(included with Python)
System Requirements
OS: Windows 10+, macOS 10.15+, or Linux
RAM: Minimum 4GB (8GB recommended)
Storage: 500MB free space
Browser: Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+
 **Installation**
Step 1: Clone the Repository
bash
git clone https://github.com/yourusername/pawrescue-ai.git
cd pawrescue-ai
Step 2: Install Frontend Dependencies
bash
cd frontend
npm install
Expected output:

added 245 packages in 15s
Step 3: Install Backend Dependencies
bash
cd ../backend
npm install
Expected output:

added 58 packages in 8s
Step 4: Install AI Service Dependencies
bash
cd ../ai-service
pip install -r requirements.txt
Expected output:

Successfully installed fastapi-0.104.1 uvicorn-0.24.0 ...
🎮 Running the Application
Quick Start (3 Terminal Method)
Terminal 1: Start AI Service
bash
cd ai-service
python main.py
✅ Expected: Uvicorn running on http://0.0.0.0:8001

Terminal 2: Start Backend
bash
cd backend
npm start
✅ Expected: 🚀 Backend running on http://localhost:5000

Terminal 3: Start Frontend
bash
cd frontend
npm run dev
✅ Expected: Local: http://localhost:5173/

Accessing the Application
Open your browser and navigate to:

http://localhost:5173
📁 Project Structure
pawrescue-ai/
├── 📂 frontend/                 # React Frontend
│   ├── 📂 src/
│   │   ├── App.jsx             # Main React component
│   │   ├── main.jsx            # React entry point
│   │   └── index.css           # Styles & animations
│   ├── index.html              # HTML template
│   ├── package.json            # Frontend dependencies
│   └── vite.config.js          # Vite configuration
│
├── 📂 backend/                  # Node.js Backend
│   ├── server.js               # Express server
│   ├── db.json                 # Report database
│   ├── facilities.json         # Rescue centers data
│   ├── package.json            # Backend dependencies
│   └── package-lock.json
│
├── 📂 ai-service/               # Python AI Service
│   ├── main.py                 # FastAPI application
│   └── requirements.txt        # Python dependencies
│
└── 📄 README.md                # This file

📈 Statistics
Lines of Code: ~2,500
Number of Files: 12
Number of Dependencies: 25
Supported Languages: 2 (JavaScript, Python)
Animals Helped: Growing daily! 🐾
Made with ❤️ by developers who care about animals

⭐ Star this repo if you found it helpful!

🐾 Together, we can save more lives!

 
