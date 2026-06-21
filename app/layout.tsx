import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPERO - Flexible Work Operating System",
  description:
    "Manage work, team, and operations in a structured workflow. Built on the Work System concept, treating all business activities as organized units.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Preconnect agar DNS/TCP tidak blocking render */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-aspekta: "Aspekta", system-ui, sans-serif;
          }
        `}</style>
      </head>
      <body
        className="bg-background text-on-surface antialiased grid-pattern relative overflow-x-hidden font-body-md"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
