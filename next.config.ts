import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'resultados.tse.jus.br',
        pathname: '/oficial/ele2026/**',
      },
    ],
  },
}

export default nextConfig
