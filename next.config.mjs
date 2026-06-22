/** @type {import('next').NextConfig} */
const nextConfig = {
  // We render all remote images with plain <img> (never next/image), so disable
  // the on-the-fly image optimizer. This closes the /_next/image endpoint, which
  // would otherwise fetch + re-encode arbitrary remote URLs (a DoS / proxy vector).
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
