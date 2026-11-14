import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await context.params;
    if (!wallet) {
      return NextResponse.json({ status: "error", detail: "Wallet address required" }, { status: 400 });
    }

    const backendUrl = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const res = await fetch(`${backendUrl}/api/chat/history/${encodeURIComponent(wallet)}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30000), // Render can take ~30s to wake/redeploy; 8s made every poll fail
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ status: "error", detail: err.detail || "Backend error" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API] Chat history fetch error:", error?.name || error);
    return NextResponse.json({ status: "error", detail: error?.message || "Internal error", history: [] }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await context.params;
    if (!wallet) {
      return NextResponse.json({ status: "error", detail: "Wallet address required" }, { status: 400 });
    }

    const backendUrl = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const res = await fetch(`${backendUrl}/api/chat/history/${encodeURIComponent(wallet)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ status: "error", detail: err.detail || "Backend error" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API] Chat history delete error:", error);
    return NextResponse.json({ status: "error", detail: error?.message || "Internal error" }, { status: 500 });
  }
}
