import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import RootLayoutContent from "./RootLayoutContent";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Vórtice CRM | Plataforma de Vendas Pro",
  description: "CRM avançado para equipes de vendas modernas, inspirado em Kommo e Sellflux.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.className} suppressHydrationWarning>
        <RootLayoutContent>
          {children}
        </RootLayoutContent>
      </body>
    </html>
  );
}
