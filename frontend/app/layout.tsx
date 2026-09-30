import type { Metadata } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import Providers from "./providers"; // your existing Nhost + Apollo providers
import NavActions from "../components/NavActions";
import "./globals.css";

const head = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["500", "700", "800"] });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument" });

export const metadata: Metadata = {
  title: "Workflow Builder",
  description: "Build automated workflows with AI steps, approvals and role-based access.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${head.variable} ${body.variable} h-full antialiased`}>
      <body>
        <Providers>
          <header className="nav">
            <Link href="/" className="brand"><i />Workflow Builder</Link>
            <nav>
              <Link href="/about">How it works</Link>
              <NavActions />
            </nav>
          </header>
          {children}
          <footer className="footer">Workflow Builder · Built with Next.js, Hasura and Nhost</footer>
        </Providers>
      </body>
    </html>
  );
}