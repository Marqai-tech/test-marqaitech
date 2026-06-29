import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, localeNames } from "@/i18n/routing";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3B82F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0F172A" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Nexus HRMS",
    template: "%s | Nexus HRMS",
  },
  description: "Nexus HRMS — SaaS-Based AI HRMS Platform by Marq AI Tech Pvt Ltd. People · Process · Technology. Comprehensive human resource management with AI-powered interviews, recruitment, payroll, and more.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nexus HRMS",
    startupImage: [
      { url: "/icons/splash-750x1334.png", media: "(device-width: 375px) and (device-height: 667px)" },
      { url: "/icons/splash-1125x2436.png", media: "(device-width: 375px) and (device-height: 812px)" },
      { url: "/icons/splash-1242x2688.png", media: "(device-width: 414px) and (device-height: 896px)" },
      { url: "/icons/splash-640x1136.png", media: "(device-width: 320px) and (device-height: 568px)" },
    ],
  },
  formatDetection: {
    telephone: false,
  },
  applicationName: "Nexus HRMS",
  icons: {
    icon: [
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "Nexus HRMS - AI-Powered HR Management",
    description: "Nexus HRMS — People · Process · Technology. A Proud Product of Marq AI Tech Pvt Ltd. SaaS-Based AI HRMS Platform with AI-powered interviews, recruitment, payroll, and more.",
    siteName: "Nexus HRMS",
    type: "website",
  },
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale?: string }>;
}>) {
  // Validate locale param (if present) against our supported locales
  const { locale } = await params;
  if (locale && !hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Get the locale + messages for the current request
  const activeLocale = locale ?? (await getLocale());
  const messages = await getMessages();
  const dir = localeNames[activeLocale as keyof typeof localeNames]?.dir ?? 'ltr';

  return (
    <html lang={activeLocale} dir={dir} className={`${inter.variable} h-full antialiased`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#3B82F6" />
        <meta name="msapplication-navbutton-color" content="#3B82F6" />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={activeLocale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(registration) {
                    console.log('Nexus SW registered:', registration.scope);
                    // Check for updates on load
                    registration.update();
                  }).catch(function(error) {
                    console.log('Nexus SW registration failed:', error);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
