# Neptune AI

Neptune AI is a powerful agentic application that combines a Next.js frontend with a Python (FastAPI) backend to perform actions on the NEAR blockchain using AI.

## Project Structure

- **Backend**: `ai-agent-backend/` (FastAPI, Python)
- **Frontend**: `NeptuneAI_V2/` (Next.js, React)

---

## 🚀 Quick Start Guide

You need to run both the backend and frontend terminals simultaneously.

### 1. Backend Setup (`ai-agent-backend`)

The backend runs the AI agent logic and connects to NEAR AI / OpenAI.

**1. Navigate to the directory:**
```bash
cd ai-agent-backend
```

**2. Create a virtual environment (optional but recommended):**
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Mac/Linux
python3 -m venv venv
source venv/bin/activate
```

**3. Install dependencies:**
```bash
pip install -r requirements.txt
```

**4. Configure Environment Variables:**
Create a file named `.env` in the `ai-agent-backend` directory.

**File:** `ai-agent-backend/.env`
```env
# Required for the AI Agent (One of these is required)
NEAR_AI_API_KEY=your_near_ai_key_here
# OR
OPENAI_API_KEY=your_openai_key_here

# Required for HOT Pay features (Create Payment Links)
HOT_PAY_API_TOKEN=your_hot_pay_token_here

# Optional/Service specific
GOOGLE_API_KEY=your_google_api_key_here
```

**5. Run the server:**
```bash
# Using uvicorn directly (recommended for dev)
uvicorn main:app --reload

# OR using Python
python main.py
```
*The backend will start at `http://127.0.0.1:8000`*

---

### 2. Frontend Setup (`NeptuneAI_V2`)

The frontend is a modern Next.js application.

**1. Navigate to the directory:**
```bash
cd NeptuneAI_V2
```

**2. Install dependencies:**
```bash
npm install
```

**3. Configure Environment Variables:**
Create a file named `.env.local` in the `NeptuneAI_V2` directory.

**File:** `NeptuneAI_V2/.env.local`
```env
# URL of the Python Backend
# If running locally on default port, this is optional as it defaults to this value.
BACKEND_URL=http://127.0.0.1:8000

# HOT Kit API Key (For Wallet Connection)
# Defaults to "neptune-ai-dev" if not provided.
NEXT_PUBLIC_HOT_API_KEY=your_hot_game_api_key
```

**4. Run the development server:**
```bash
npm run dev
```

**5. Open the app:**
Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## Troubleshooting

- **Backend Connection Error**: If the frontend says "Can't connect to server", ensure the Python backend is running and `BACKEND_URL` in `.env.local` matches the running backend address.
- **Wallet Connection**: If wallet connection fails, check your internet connection and ensure `NEXT_PUBLIC_HOT_API_KEY` is valid (or remove it to use the default dev key).
