import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poke Pane",
  description: "A visual-first competitive Pokémon team builder",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
