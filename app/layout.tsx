import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.najcrm.sk"),
  title: "Epoxidovo Manager · CRM",
  description:
    "Epoxidovo CRM — leady, generátor ponúk, kalendár pripomienok.",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "Epoxidovo Manager · CRM",
    description: "Interný CRM systém pre obchodný tím Epoxidovo s. r. o.",
    url: "https://app.najcrm.sk",
    siteName: "Epoxidovo Manager",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Epoxidovo Manager CRM",
      },
    ],
    locale: "sk_SK",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Epoxidovo Manager · CRM",
    description: "Interný CRM systém pre obchodný tím Epoxidovo s. r. o.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk" className={inter.variable}>
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
