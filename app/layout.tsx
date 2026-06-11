import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mondialul Prietenilor",
  description: "Predictii live pentru faza grupelor"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
