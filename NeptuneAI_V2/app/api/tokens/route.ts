export async function GET() {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    const response = await fetch(`${backendUrl}/tokens`);

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return Response.json(data);
  } catch (e) {
    console.error("Tokens proxy error:", e);
    return Response.json({
      error: e instanceof Error ? e.message : String(e),
      tokens: [],
      count: 0,
    });
  }
}
