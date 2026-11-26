import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cast",
  description: "Video-first. Create, share, and grow on Cast.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Cast", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#07080a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-canvas text-neutral-900">{children}</body>
    </html>
  );
}
