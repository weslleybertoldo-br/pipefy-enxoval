import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pipefy Enxoval - Automação",
  description: "Automação de registro de enxoval no Pipefy",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
