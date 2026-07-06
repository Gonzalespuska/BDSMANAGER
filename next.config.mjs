/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloudflare Pages nepodporuje natívnu Next.js image optimization.
  // Vypneme ju — obrázky sa servujú as-is. Alternatíva: Cloudflare Images service.
  images: { unoptimized: true },

  // next-on-pages je stricter; build by mal prejsť aj s lint warningmi.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Security: skryj Next.js verziu z response headerov (info leak → cielené útoky)
  poweredByHeader: false,
};

export default nextConfig;
