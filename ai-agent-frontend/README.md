# ZTARKNEAR Swap: AI Agent Multi-Chain Swaps

A complete AI-powered swap interface for the NEAR Protocol, featuring an intelligent agent that handles multi-chain token swaps with natural language.

## Project Structure

- `ai-agent-backend/`: Python FastAPI server with LangChain orchestration and NEAR AI integration.
- `ai-agent-frontend/`: React + Vite frontend with NEAR Wallet Selector and Chat interface.

---

## 🚀 Getting Started

### 1. Backend Setup

The backend handles the AI logic, token caching, and transaction preparation.

```bash
# Navigate to backend
cd ai-agent-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
# Create a .env file with:
# NEAR_AI_API_KEY=your_key_here
```

**Run Backend:**
```bash
python main.py
```
*Server runs at http://localhost:8000*

---

### 2. Frontend Setup

The frontend provides the chat interface and handles transaction signing.

```bash
# Navigate to frontend (from root)
cd ai-agent-frontend

# Install dependencies
npm install

# Run Frontend
npm run dev
```
*App runs at http://localhost:5173*

---

## 🛠 Key Features

### Intelligent Multi-Chain Swaps
- **Badge-Style Prefixes**: Uses `[NEAR]`, `[ETH]`, `[BSC]` to distinguish tokens.
- **Auto-Filtering**: NEAR tokens prioritized for input; all chains supported for output.
- **Smart Logic**: Automatically detects cross-chain swaps from prefixes, bypassing unnecessary database lookups.
- **Token Caching**: 5-minute cache for fast token discovery and chain verification.

### AI Orchestration
- **NEAR AI Powered**: Uses `gpt-oss-120b` for advanced intent recognition.
- **Tool-Call Architecture**: LLM intelligently selects tools for quotes, confirmations, and validations.
- **Conversation History**: Maintains context for seamless follow-up questions and confirmations.

## 🛡 Security
- **Non-Custodial**: The agent prepares transaction payloads but **never** accesses private keys.
- **User Signature**: All transactions must be reviewed and signed by the user in their connected NEAR wallet.
