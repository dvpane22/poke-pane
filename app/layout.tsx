import type { Metadata } from "next";
import { AuthSession } from "./components/AuthSession";
import { NintendoAttribution } from "./components/NintendoAttribution";
import { isAppPasswordEnabled } from "../lib/app-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poke Pane",
  description: "A visual-first competitive Pokémon team builder",
  icons: {
    icon: "/pokepane-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authEnabled = isAppPasswordEnabled();

  return (
    <html lang="en">
      <body>
        {authEnabled ? <AuthSession>{children}</AuthSession> : children}
        <NintendoAttribution />
      </body>
    </html>
  );
}
