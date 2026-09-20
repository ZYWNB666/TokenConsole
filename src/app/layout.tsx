import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TokenAPI — Enterprise AI API Console",
    template: "%s — TokenAPI",
  },
  description:
    "TokenAPI is an enterprise console for AI API management. Foundation preview: no real authentication or backend is connected yet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
