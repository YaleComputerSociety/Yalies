import https from "https";
import http from "http";

export type HttpResponse = {
	status: number;
	headers: Record<string, string | string[] | undefined>;
	body: string;
	cookies: Record<string, string>;
};

const DEFAULT_HEADERS: Record<string, string> = {
	"Accept": "*/*",
	"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
};

function parseSetCookies(setCookieHeaders: string | string[] | undefined): Record<string, string> {
	const cookies: Record<string, string> = {};
	if (!setCookieHeaders) return cookies;
	const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
	for (const header of headers) {
		const match = header.match(/^([^=]+)=([^;]*)/);
		if (match) {
			cookies[match[1]] = match[2];
		}
	}
	return cookies;
}

function rawRequest(
	url: string,
	method: "GET" | "POST",
	headers: Record<string, string>,
	body?: string,
): Promise<HttpResponse> {
	return new Promise((resolve, reject) => {
		const parsedUrl = new URL(url);
		const client = parsedUrl.protocol === "https:" ? https : http;

		const reqHeaders: Record<string, string> = {
			...DEFAULT_HEADERS,
			...headers,
		};

		if (body !== undefined) {
			reqHeaders["Content-Length"] = Buffer.byteLength(body).toString();
		}

		const req = client.request(parsedUrl, { method, headers: reqHeaders }, (res) => {
			let responseBody = "";
			res.on("data", (chunk) => { responseBody += chunk; });
			res.on("end", () => {
				resolve({
					status: res.statusCode ?? 0,
					headers: res.headers as Record<string, string | string[] | undefined>,
					body: responseBody,
					cookies: parseSetCookies(res.headers["set-cookie"]),
				});
			});
		});

		req.on("error", reject);
		if (body !== undefined) req.write(body);
		req.end();
	});
}

export async function httpGet(
	url: string,
	headers: Record<string, string> = {},
	followRedirects = false,
	maxRedirects = 5,
): Promise<HttpResponse> {
	let currentUrl = url;
	let currentHeaders = { ...headers };

	for (let i = 0; i <= maxRedirects; i++) {
		const resp = await rawRequest(currentUrl, "GET", currentHeaders);

		if (followRedirects && resp.status >= 300 && resp.status < 400 && resp.headers.location) {

			if (resp.cookies.JSESSIONID) {
				currentHeaders = {
					...currentHeaders,
					"Cookie": currentHeaders["Cookie"]?.replace(
						/JSESSIONID=[^;]*/,
						`JSESSIONID=${resp.cookies.JSESSIONID}`,
					) ?? `JSESSIONID=${resp.cookies.JSESSIONID}`,
				};
			}

			const location = resp.headers.location as string;
			if (location.startsWith("http")) {
				currentUrl = location;
			} else {
				const base = new URL(currentUrl);
				currentUrl = `${base.protocol}//${base.host}${location}`;
			}
			continue;
		}

		return resp;
	}

	throw new Error(`Too many redirects for ${url}`);
}

export async function httpPost(url: string, headers: Record<string, string>, body: string): Promise<HttpResponse> {
	return rawRequest(url, "POST", headers, body);
}
