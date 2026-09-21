import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dev server only: hosts the console may be reached from on this machine.
  // Next 16 blocks dev resources from unknown origins, which prevents
  // hydration and breaks the login form for anyone using these addresses.
  allowedDevOrigins: ["127.0.0.1", "192.168.115.115"],
};

export default nextConfig;
