# NEAR Agent Authorization Guide (Frontend)

This guide explains how to implement the "One-Click" agent authorization flow in your frontend.

## Flow Overview
1.  **Propose**: Request a new agent public key and transaction payload.
2.  **Sign**: Use the NEAR Wallet Selector to sign and broadcast the `AddKey` transaction.
3.  **Activate**: Notify the backend of the successful activation.

---

## 1. Request Authorization Payload

Call the `/api/agent-wallet/create` (POST) or `/api/agent-wallet/propose/{wallet_address}` (GET) endpoint.

```javascript
const response = await fetch('/api/agent-wallet/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ wallet_address: 'user.near' })
});

const { key_id, sign_payload } = await response.json();
```

## 2. Sign Transaction with NEAR Wallet Selector

Pass the `sign_payload` directly to the `signAndSendTransaction` method of your wallet selector.

```javascript
import { useWalletSelector } from "@near-wallet-selector/react";

const { selector } = useWalletSelector();
const wallet = await selector.wallet();

const result = await wallet.signAndSendTransaction({
  receiverId: sign_payload.receiverId,
  actions: sign_payload.actions
});

// result.transaction_outcome.id is the tx_hash
const tx_hash = result.transaction.hash;
```

## 3. Activate the Agent Key

Once the transaction is successful, call the activate endpoint to enable the agent.

```javascript
await fetch('/api/agent-wallet/activate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key_id: key_id,
    agent_account_id: 'user.near', // The account the key was added to
    tx_hash: tx_hash
  })
});

console.log("Agent Authorized & Active!");
```

## Benefits of this Flow
- **Standard UX**: Users see a familiar "Add Access Key" request in their wallet.
- **Security**: The agent ONLY has access to the user's account if the user signs this transaction.
- **Simplicity**: No manual public key copying/pasting.
