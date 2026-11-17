import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Rhino Agent Hub", robots: { index: false, follow: false } };

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0e0d0d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
