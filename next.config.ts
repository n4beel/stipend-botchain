import type { NextConfig } from "next";

/**
 * Security headers are set here rather than only in `netlify.toml`.
 *
 * A host-level header rule did not reach responses served by the Next.js server handler: on the
 * live deploy, `Strict-Transport-Security` and `X-Content-Type-Options` were present because
 * Netlify sets those itself, while the two rules this project actually added were missing. Emitting
 * them from Next means they apply to every route on any host, which also matters because fifteen
 * projects should not each rediscover this.
 */
const securityHeaders = [
  // No file this app touches ever leaves the browser, and nothing here is meant to be embedded.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // A certificate URL contains a document's digest. Sending that to a third party in a Referer
  // header would leak which document someone is checking.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Hashing needs crypto.subtle, which browsers expose only in a secure context. HSTS keeps a
  // recipient who types http:// from reaching a build where hashing silently does not work.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
