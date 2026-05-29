import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BDSManager — Business Data Sales Manager",
  description:
    "Call-agent CRM s SLA trackingom. Združuje leady zo všetkých zdrojov na jedno miesto.",
  robots: { index: false, follow: false },
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
