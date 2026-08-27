import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import "./globals.css";

/* One UI family, set tight and heavy at display sizes.
   Inter is the best-engineered face for 13-14px dense data and ships a
   proper tabular-figure set, which a system full of money columns needs. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/* Document numbers, SKUs and tax IDs. Slashed zero and unambiguous
   1/l/I -- worth more here than personality. */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Glide",
    template: "%s · Glide",
  },
  description: "Glide — inventory, sales and invoicing for growing businesses.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-density="comfortable"
      suppressHydrationWarning
      className={`h-full ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
