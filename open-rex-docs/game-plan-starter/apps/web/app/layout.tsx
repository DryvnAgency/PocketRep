import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenRex · The desk manager's tool",
  description:
    "Manager-led mass-text campaign engine for car dealerships. Per-customer LLM-written outbound, hybrid AI autonomy, TCPA attestation per Game Plan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Inter+Tight:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
