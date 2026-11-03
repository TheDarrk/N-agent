path = r"NeptuneAI_V2\app\api\[...path]\route.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_block = """        const data = await response.json();
        return Response.json(data, { status: response.status });"""

new_block = """        const contentType = response.headers.get("content-type") || "";
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

        const data = await response.json();
        return Response.json(data, { status: response.status });"""

if old_block in content:
    content = content.replace(old_block, new_block, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("SUCCESS: Updated route.ts")
else:
    print("FAILED: old_block not found")
