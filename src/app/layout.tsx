import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/features/appearance/theme-provider";
import { PwaRegistration } from "@/features/offline/pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "pixzer — Your games, close at hand",
  applicationName: "pixzer",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/brand/pixzer-logo-tv-vacia-negro.png",
        type: "image/png",
        sizes: "1040x422",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/brand/pixzer-logo-tv-vacia-blanco.png",
        type: "image/png",
        sizes: "1040x422",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: [
      {
        url: "/brand/pixzer-logo-tv-vacia-negro.png",
        type: "image/png",
        sizes: "1040x422",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/brand/pixzer-logo-tv-vacia-blanco.png",
        type: "image/png",
        sizes: "1040x422",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
  description:
    "A private library for playing your legally obtained retro games in the browser.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var dark=!!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var p="system";try{p=localStorage.getItem("pocketarcade.appearance")||"system"}catch(e){}if(p!=="light"&&p!=="dark")p="system";var t=p==="system"?(dark?"dark":"light"):p;var r=document.documentElement;r.dataset.appearance=p;r.dataset.theme=t;r.style.colorScheme=t})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <PwaRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}
