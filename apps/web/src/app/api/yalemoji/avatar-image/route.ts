// The public asset bucket has no canvas CORS headers. Proxy only versioned
// Yalemoji PNGs so the browser can measure alpha without exposing an app key.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export async function GET(request: Request) {
	let source: URL;
	try {
		source = new URL(new URL(request.url).searchParams.get("url") || "");
		if(source.protocol !== "https:" || source.host !== "storage.googleapis.com"
			|| source.username || source.password || source.search || source.hash
			|| !/^\/yalemoji-avatars\/avatars\/[a-zA-Z0-9_-]+\/[1-9]\d*\/avatar\.png$/.test(source.pathname)) {
			return new Response("Invalid avatar URL", { status: 400 });
		}
	} catch {
		return new Response("Invalid avatar URL", { status: 400 });
	}
	try {
		const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(5000), cache: "force-cache" });
		if(!response.ok || !response.body || response.headers.get("content-type")?.split(";")[0] !== "image/png") {
			return new Response("Avatar unavailable", { status: 502 });
		}
		const reader = response.body.getReader();
		const chunks: Uint8Array[] = [];
		let length = 0;
		while(true) {
			const { value, done } = await reader.read();
			if(done) break;
			length += value.length;
			if(length > MAX_IMAGE_BYTES) {
				await reader.cancel();
				return new Response("Avatar too large", { status: 413 });
			}
			chunks.push(value);
		}
		const bytes = new Uint8Array(length);
		let offset = 0;
		for(const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
		return new Response(bytes, { headers: {
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=31536000, immutable",
			"X-Content-Type-Options": "nosniff",
		} });
	} catch {
		return new Response("Avatar unavailable", { status: 502 });
	}
}
