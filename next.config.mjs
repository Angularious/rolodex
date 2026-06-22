/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // react-force-graph ships ESM that Next's client bundle needs transpiled.
  transpilePackages: ['react-force-graph-3d'],
};

export default nextConfig;
