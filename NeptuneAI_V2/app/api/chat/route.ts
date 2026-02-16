export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      message,
      session_id: sessionId,
      account_id: accountId,
      wallet_addresses: walletAddresses,
      balances,
    } = body;

    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";

    console.log(`[API] Proxying chat request to ${backendUrl}/chat`);
    console.log(`[API] Message: ${message?.substring(0, 100)}...`);

    // Add timeout to prevent infinite hangs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
      const response = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          session_id: sessionId,
          account_id: accountId,
          wallet_addresses: walletAddresses,
          balances,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[API] Backend error: ${response.status}`);
        const errorData = await response.json().catch(() => ({}));
        return Response.json(
          { response: errorData.detail || "Error from AI backend" },
          { status: response.status }
        );
      }

      const data = await response.json();
      console.log(`[API] Response received successfully`);
      return Response.json(data);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('[API] Request timeout after 60 seconds');
        return Response.json(
          {
            response: "Request timed out. The AI is taking too long to respond. Please try again.",
            action: null,
            payload: null,
          },
          { status: 504 }
        );
      }
      throw fetchError;
    }
  } catch (e) {
    console.error("Chat proxy error:", e);
    return Response.json(
      {
        response: "Can't connect to server, please try again later code : 500",
        action: null,
        payload: null,
      },
      { status: 500 }
    );
  }
}
