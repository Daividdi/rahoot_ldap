const nextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: false,
  transpilePackages: ["packages/*", "@t3-oss/env-nextjs"],
  devIndicators: false,
}

export default nextConfig
