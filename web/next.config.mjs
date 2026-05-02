/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Move out of experimental and add common hosts
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.github.dev", "*.app.github.dev"],
}

export default nextConfig
