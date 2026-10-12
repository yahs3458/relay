import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Relay is a concept CRM with an AI follow-up agent built in: it finds leads that went quiet, drafts the right message, and waits for your approval. Built by Yash Techstudio.";

export const metadata: Metadata = {
  title: "Relay — the CRM where an AI agent does your follow-ups",
  description,
  openGraph: { title: "Relay — AI follow-up agent inside your CRM", description, type: "website" },
  twitter: { card: "summary_large_image", title: "Relay — AI follow-up agent inside your CRM", description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
