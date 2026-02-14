# AI Agent NLP Transaction Workflow

## 1. System Overview
This project enables users to execute crypto transactions (specifically swaps on NEAR) using natural language commands.
It leverages a **Python backend with LangChain** to orchestrate two layers of LLMs (Intent & Execution) and a separate **Frontend** for user interaction and signing.

## 2. Architecture

### Frontend (User Interface)
- **Type**: Web Application (React/Next.js) - Separate from the existing swap UI.
- **Role**:
    - Capture voice/text input from the user.
    - Display agent responses (quotes, confirmation requests).
    - **Wallet Integration**: Handle wallet connection (NEAR Wallet Selector) and **sign transactions**. The private key never leaves the user's browser/wallet.

### Backend (Orchestration Engine)
- **Stack**: Python, LangChain.
- **Role**: Process natural language, interface with blockchain tools, and manage the conversational state.

---

## 3. Detailed Workflow Steps

### Step 1: User Input
**User Says/Types:**
> "Swap my 5 near for eth"

**Frontend Action:**
- Sends this string to the Backend API.

### Step 2: Layer 1 - Intent Recognition & Quote fetching
**Agent Role:** "The Planner"
- **Input**: "Swap my 5 near for eth"
- **Logic**:
    1.  **Parse Intent**:
        -   *Action*: `SWAP`
        -   *Source Token*: `NEAR` (Extracted or inferred)
        -   *Destination Token*: `ETH`
        -   *Amount*: `5`
        -   *Chain*: `NEAR` (Default assumption if not specified).
    2.  **Validation**: Check if all necessary parameters are present. If undefined, ask clarifying questions (e.g., "Which chain?").
    3.  **Tool Call**: `get_token_prices` or `get_swap_quote`.
        -   *Simulated Call*: `get_quote(in="NEAR", out="ETH", amount=5, chain="NEAR")`
        -   *Result*: "5 NEAR = 0.012 ETH (approx)".
- **Output**: A structured response + natural language summary.
    -   *JSON*: `{"action": "confirm_swap", "params": {...}, "quote": "..."}`
    -   *Message*: "I found a quote: 5 NEAR for approx 0.012 ETH on NEAR Protocol. Do you want to proceed?"

### Step 3: User Confirmation
**Frontend Action:**
- Displays the message and quote.
- User responds: "Yes, go ahead" or "Confirm".

### Step 4: Layer 2 - Execution Orchestration
**Agent Role:** "The Executor"
- **Trigger**: User confirmation received.
- **Input**: Validated Intent + "Confirm" signal.
- **Logic**:
    1.  **Verify Context**: Ensure the quote is still valid (optional) and params match.
    2.  **Tool Call**: `create_near_intent_transaction`.
        -   *Function*: Uses the specific "NEAR Intent" tool/library.
        -   *Arguments*: `token_in="NEAR"`, `token_out="ETH"`, `amount=5`.
        -   *Process*:
            -   Constructs the transaction payload (function call to smart contract).
            -   **Does NOT sign**. Returns the unsigned transaction object (TransactionRequest).
- **Output**: The unsigned transaction payload.

### Step 5: Final Execution (Signing)
**Frontend Action:**
- Receives the transaction payload.
- Triggers the Wallet Selector (e.g., Meteor, MyNearWallet).
- **User Action**: Approves/Signs the transaction in the wallet.
- **Network**: Transaction is broadcasted to the blockchain.

---

## 4. Technical Components

### LangChain Tools

#### Tool 1: `IntentParser` (LLM Chain)
- **Prompt**:
  > You are a DeFi assistant. Extract these fields: Chain (default NEAR), Action (Swap, Transfer), Amount, Token In, Token Out.
- **Output Parser**: Pydantic object `SwapIntent`.

#### Tool 2: `NearQuoteFetcher` (Python Function)
- Connects to a price aggregator (Ref Finance or similar via API) to get indicative rates.

#### Tool 3: `NearTransactionBuilder` (Python Function)
- **Library**: `near-api-py` or similar, plus the custom "Near Intent" logic.
- **Functionality**:
    - Build a function call to the specific intent contract.
    - Encode arguments (Base64/Borsh).
    - Return a JSON serializable object that the frontend can ingest.

## 5. Security Note
- The Agent **never** has access to private keys.
- All "Execution" by the agent is strictly "Transaction Building".
- Final authority rests with the user's signature.

