import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'PromptMaster Engine',
    template: '%s | PromptMaster Engine',
  },
  description:
    'Professional AI workflow platform that structures interactions with LLMs using modes, evaluation, and iterative refinement. Built for analysts, auditors, lawyers, and strategists.',
  keywords: [
    'prompt engineering',
    'AI workflow',
    'LLM',
    'structured prompting',
    'evaluation',
    'alignment',
    'drift detection',
    'PromptMaster',
  ],
  authors: [{ name: 'PromptMaster Engine' }],
  openGraph: {
    type: 'website',
    title: 'PromptMaster Engine',
    description:
      'Structure your AI interactions for better results. Modes, evaluation, and iterative refinement — not just prompting.',
    siteName: 'PromptMaster Engine',
  },
  twitter: {
    card: 'summary',
    title: 'PromptMaster Engine',
    description:
      'Professional AI workflow platform with structured prompting, evaluation scoring, and iterative refinement.',
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/logo.svg',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-[var(--surface)] text-[var(--on-surface)] min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
