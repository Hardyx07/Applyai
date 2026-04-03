import type { Metadata } from "next";
import { Lora, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./pages.css";
import { AuthProvider } from "./contexts/AuthContext";

const fontLora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

const fontDMSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const fontJetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ApplyAI",
  description: "AI-powered career assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontLora.variable} ${fontDMSans.variable} ${fontJetbrainsMono.variable}`}
    >
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
