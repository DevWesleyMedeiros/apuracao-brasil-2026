import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Apuração Brasil · Eleições 2026',
  description:
    'Acompanhe os turnos das eleições de 2026. Apuração oficial do TSE e projeção estatística claramente separadas.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
