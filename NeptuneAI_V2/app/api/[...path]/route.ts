/**
 * Neptune AI v2 — Autonomy API Proxy
 * Catch-all route that proxies /api/* requests to the Python backend.
 * Handles: settings, strategies, logs, kill-switch, autonomy-status, storage-status, reasoning-trace, research streaming
 */

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_URL = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

// Short reads fail fast so a stalled backend can't pin Vercel functions for 300s each.
const GET_TIMEOUT_MS = 20000;
const WRITE_TIMEOUT_MS = 120000;

function isStreamPath(p: string) {
    return p.includes("/stream");
}

/** Parse backend body as JSON; HTML/plain-text error pages become a JSON error instead of throwing. */
async function toJsonResponse(response: Response) {
    const text = await response.text();
    try {
        return Response.json(JSON.parse(text), { status: response.status });
    } catch {
        return Response.json(
            { error: "Backend returned a non-JSON response", status: response.status },
            { status: response.ok ? 502 : response.status }
        );
    }
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const backendPath = `/api/${path.join("/")}`;
    const url = new URL(req.url);
    const queryString = url.search;

    try {
        const response = await fetch(`${BACKEND_URL}${backendPath}${queryString}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            ...(isStreamPath(backendPath) ? {} : { signal: AbortSignal.timeout(GET_TIMEOUT_MS) }),
        });

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson") || backendPath.includes("/stream")) {
            return new Response(response.body, {
                status: response.status,
                headers: {
                    "Content-Type": contentType || "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            });
        }

        return await toJsonResponse(response);
    } catch (e) {
        console.error(`[AUTONOMY PROXY] GET ${backendPath} error:`, e);
        return Response.json(
            { error: "Cannot reach backend" },
            { status: 502 }
        );
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const backendPath = `/api/${path.join("/")}`;
    const url = new URL(req.url);
    const queryString = url.search;

    let body = null;
    try {
        body = await req.json();
    } catch {
        // Some POST endpoints (like kill-switch) may not have a body
    }

    try {
        const response = await fetch(`${BACKEND_URL}${backendPath}${queryString}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
            ...(isStreamPath(backendPath) ? {} : { signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) }),
        });

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson") || backendPath.includes("/stream")) {
            return new Response(response.body, {
                status: response.status,
                headers: {
                    "Content-Type": contentType || "application/x-ndjson",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            });
        }

        return await toJsonResponse(response);
    } catch (e) {
        console.error(`[AUTONOMY PROXY] POST ${backendPath} error:`, e);
        return Response.json(
            { error: "Cannot reach backend" },
            { status: 502 }
        );
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const backendPath = `/api/${path.join("/")}`;
    const url = new URL(req.url);
    const queryString = url.search;

    let body = null;
    try {
        body = await req.json();
    } catch {
        // Empty body fallback
    }

    try {
        const response = await fetch(`${BACKEND_URL}${backendPath}${queryString}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
            ...(isStreamPath(backendPath) ? {} : { signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) }),
        });

        return await toJsonResponse(response);
    } catch (e) {
        console.error(`[AUTONOMY PROXY] PATCH ${backendPath} error:`, e);
        return Response.json(
            { error: "Cannot reach backend" },
            { status: 502 }
        );
    }
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const backendPath = `/api/${path.join("/")}`;
    const url = new URL(req.url);
    const queryString = url.search;

    let body = null;
    try {
        body = await req.json();
    } catch {
        // Empty body fallback
    }

    try {
        const response = await fetch(`${BACKEND_URL}${backendPath}${queryString}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
            ...(isStreamPath(backendPath) ? {} : { signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) }),
        });

        return await toJsonResponse(response);
    } catch (e) {
        console.error(`[AUTONOMY PROXY] PUT ${backendPath} error:`, e);
        return Response.json(
            { error: "Cannot reach backend" },
            { status: 502 }
        );
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const backendPath = `/api/${path.join("/")}`;
    const url = new URL(req.url);
    const queryString = url.search;

    let body = null;
    try {
        body = await req.json();
    } catch {
        // Empty body fallback
    }

    try {
        const response = await fetch(`${BACKEND_URL}${backendPath}${queryString}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                // Forward admin token so /api/admin/* endpoints (e.g. wipe-all) can authenticate
                ...(req.headers.get("x-admin-token") ? { "X-Admin-Token": req.headers.get("x-admin-token") as string } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            ...(isStreamPath(backendPath) ? {} : { signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) }),
        });

        return await toJsonResponse(response);
    } catch (e) {
        console.error(`[AUTONOMY PROXY] DELETE ${backendPath} error:`, e);
        return Response.json(
            { error: "Cannot reach backend" },
            { status: 502 }
        );
    }
}
