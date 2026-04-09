import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { SessionProvider } from "next-auth/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Foreign Currency Payment Tracker",
  description: "Track foreign currency payments and card availability",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/30 overflow-x-clip`}
      >
        <SessionProvider>
          <div className="min-h-screen min-w-0">
            <Navigation />
            <main className="max-w-7xl mx-auto w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              {children}
            </main>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
