import type { Metadata, Viewport } from "next";
import { PasswordGate } from "@/components/password-gate";
import { hasPageAccess } from "@/lib/access";
import "./globals.css";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "Meet your Persona",
  description: "Create a personal assistant that learns how to help.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authorized = await hasPageAccess();
  return (
    <html lang="en">
      <body className="antialiased">{authorized ? children : <PasswordGate />}</body>
    </html>
  );
}
