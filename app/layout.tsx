import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FactorIA Agent Platform — POC",
  description:
    "POC omnicanal: Web / WhatsApp / Phone → ElevenLabs Conversational AI → FactorIA Tool Layer → Sistemas del cliente.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}