import { PHASE_PRODUCTION_BUILD } from "next/constants.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
    async headers() {
        return [{ source: "/connect", headers: [
            { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
            { key: "Referrer-Policy", value: "no-referrer" },
            { key: "Cache-Control", value: "no-store" },
        ] }];
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    ...(process.env.YALIES_PREVIEW === "true" && {
        async rewrites() {
            return [{ source: "/v3/:path*", destination: "http://127.0.0.1:3001/v3/:path*" }];
        },
    }),
};

export default function config(phase) {
    if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_YALIES_API_URL?.trim()) {
        throw new Error("NEXT_PUBLIC_YALIES_API_URL is required for production builds. Use npm run deploy for production deployment.");
    }
    return nextConfig;
}
