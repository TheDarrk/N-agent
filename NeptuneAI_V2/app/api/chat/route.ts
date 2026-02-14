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
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return Response.json(
        { response: errorData.detail || "Error from AI backend" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
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
