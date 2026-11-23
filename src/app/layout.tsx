import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PocketArcade — Your games, close at hand",
  description:
    "A private library for playing your legally obtained retro games in the browser.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
