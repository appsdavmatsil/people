import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  async redirects() {
    return [
      { source: "/", destination: "/dashboard", permanent: false },
      { source: "/staff", destination: "/staffdirectory", permanent: false },
      { source: "/staff/:path*", destination: "/staffdirectory/:path*", permanent: false },
      { source: "/schedule", destination: "/staffdeployment", permanent: false },
    ];
  },
};

export default nextConfig;
