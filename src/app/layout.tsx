import type { Metadata } from "next";
import { Space_Grotesk, Manrope, Geist_Mono } from "next/font/google";
import "./globals.css";

// Design system fonts ("Rivermead Black & Gold", Sept 2026 — see
// globals.css header comment). Space Grotesk for headings/emphasis,
// Manrope for body copy. Geist Mono kept around for any monospace/
// code-ish display; nothing in the app currently renders in it.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rivermead Stock Manager",
  description: "Parts and tyres stock management for Rivermead",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // No `dark` class here — Joanne asked for the black background to
      // come back out (Sept 2026), so the light `:root` palette in
      // globals.css (white ground, black & gold accents) is what renders.
      // `.dark` is kept defined (the original black theme) in case a
      // toggle is ever wanted later, but nothing currently applies it.
      className={`${spaceGrotesk.variable} ${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
