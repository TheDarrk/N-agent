/**
 * Swap quote fetching and transaction building for NEAR Intents.
 */

import { TOKEN_MAP, DECIMALS_MAP } from "./constants";
import { getAvailableTokensFromApi, getTokenBySymbol } from "./knowledge-base";

export interface SwapQuote {
  token_in: string;
  token_out: string;
  amount_in: number;
  amount_out: number;
  rate: number;
  chain: string;
  deposit_address: string;
  defuse_asset_in: string;
  defuse_asset_out: string;
}

export interface SwapQuoteResult {
  quote?: SwapQuote;
  error?: string;
}

export interface TransactionAction {
  type: string;
  params: {
    methodName: string;
    args: Record<string, unknown>;
    gas: string;
    deposit: string;
  };
}

export interface TransactionPayload {
  receiverId: string;
  actions: TransactionAction[];
}

export async function isCrossChainSwap(
  tokenIn: string,
  tokenOut: string
): Promise<boolean> {
  try {
    const tokens = await getAvailableTokensFromApi();
    const tokenInData = getTokenBySymbol(tokenIn, tokens);
    const tokenOutData = getTokenBySymbol(tokenOut, tokens);

    if (!tokenInData || !tokenOutData) return false;

    let chainIn = (tokenInData.blockchain || "near").toLowerCase();
    let chainOut = (tokenOutData.blockchain || "near").toLowerCase();

    if (chainIn === "aurora") chainIn = "near";
    if (chainOut === "aurora") chainOut = "near";

    return chainIn !== chainOut;
  } catch {
    return false;
  }
}

export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amount: number,
  recipientId: string,
  chainId = "near"
): Promise<SwapQuoteResult> {
  const tIn = tokenIn.toUpperCase();
  const tOut = tokenOut.toUpperCase();

  const assetIn = TOKEN_MAP[tIn];
  const assetOut = TOKEN_MAP[tOut];

  if (!assetIn || !assetOut) {
    return { error: `Token pair ${tIn}->${tOut} not supported` };
  }

  if (!recipientId) {
    return { error: "Wallet must be connected to fetch a quote" };
  }

  const decimalsIn = DECIMALS_MAP[tIn] ?? 24;
  const amountAtomic = BigInt(Math.round(amount * 10 ** decimalsIn)).toString();

  const deadline = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const payload = {
    swapType: "EXACT_INPUT",
    originAsset: assetIn,
    destinationAsset: assetOut,
    amount: amountAtomic,
    depositType: "INTENTS",
    refundType: "INTENTS",
    recipient: recipientId,
    recipientType: "DESTINATION_CHAIN",
    refundTo: recipientId,
    slippageTolerance: 10,
    dry: false,
    deadline,
    quoteWaitingTimeMs: 0,
  };

  // Retry logic - up to 8 attempts
  let lastError = "";
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const response = await fetch(
        "https://1click.chaindefuser.com/v0/quote",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.message) {
        return { error: data.message };
      }

      const quote = data.quote || data;
      if (!quote.depositAddress) {
        return { error: "No deposit address found in quote" };
      }

      const amountOutAtomic = BigInt(quote.amountOut);
      const decimalsOut = DECIMALS_MAP[tOut] ?? 18;
      const amountOutFmt =
        Number(amountOutAtomic) / 10 ** decimalsOut;

      return {
        quote: {
          token_in: tIn,
          token_out: tOut,
          amount_in: amount,
          amount_out: amountOutFmt,
          rate: amount > 0 ? amountOutFmt / amount : 0,
          chain: chainId,
          deposit_address: quote.depositAddress,
          defuse_asset_in: assetIn,
          defuse_asset_out: assetOut,
        },
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < 8) {
        await new Promise((r) =>
          setTimeout(r, Math.min(1000 * 2 ** (attempt - 1), 10000))
        );
      }
    }
  }

  return {
    error: `Unable to fetch quote after 8 attempts: ${lastError}`,
  };
}

export function createNearIntentTransaction(
  tokenIn: string,
  tokenOut: string,
  amount: number,
  _minAmountOut: number,
  depositAddress = "solver-relay.near"
): TransactionPayload[] {
  const contractId = "intents.near";
  const transactions: TransactionPayload[] = [];

  const decimalsIn = DECIMALS_MAP[tokenIn.toUpperCase()] ?? 24;
  const amountInt = BigInt(Math.round(amount * 10 ** decimalsIn)).toString();

  if (tokenIn.toLowerCase() === "near") {
    // Wrap NEAR then deposit to intents
    transactions.push({
      receiverId: "wrap.near",
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "storage_deposit",
            args: {
              account_id: contractId,
              registration_only: true,
            },
            gas: "30000000000000",
            deposit: "1250000000000000000000",
          },
        },
        {
          type: "FunctionCall",
          params: {
            methodName: "near_deposit",
            args: {},
            gas: "10000000000000",
            deposit: amountInt,
          },
        },
        {
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer_call",
            args: {
              receiver_id: contractId,
              amount: amountInt,
              msg: "",
            },
            gas: "50000000000000",
            deposit: "1",
          },
        },
      ],
    });
  } else {
    // NEP-141 token deposit
    const tInContract =
      TOKEN_MAP[tokenIn.toUpperCase()]?.replace("nep141:", "") ||
      `${tokenIn.toLowerCase()}.near`;

    transactions.push({
      receiverId: tInContract,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer_call",
            args: {
              receiver_id: contractId,
              amount: amountInt,
              msg: "",
            },
            gas: "50000000000000",
            deposit: "1",
          },
        },
      ],
    });
  }

  // Swap (mt_transfer) to solver
  transactions.push({
    receiverId: contractId,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "mt_transfer",
          args: {
            token_id:
              TOKEN_MAP[tokenIn.toUpperCase()] ||
              `nep141:${tokenIn.toLowerCase()}.near`,
            receiver_id: depositAddress,
            amount: amountInt,
            msg: "",
          },
          gas: "30000000000000",
          deposit: "1",
        },
      },
    ],
  });

  return transactions;
}
