/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/",
        destination: "/ecosystem",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
