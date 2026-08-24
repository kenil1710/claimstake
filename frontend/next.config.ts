import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * The routes moved when the landing page and the app were split apart.
   * Permanent redirects rather than deleted routes, so any link already shared
   * — a filed claim someone bookmarked, a link in a demo — still lands
   * somewhere useful instead of on a 404.
   */
  async redirects() {
    return [
      { source: "/new", destination: "/challenge", permanent: true },
      { source: "/me", destination: "/history", permanent: true },
    ];
  },
};

export default nextConfig;
