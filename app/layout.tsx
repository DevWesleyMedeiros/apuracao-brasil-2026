import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Apuração Brasil · Eleições 2026',
  description:
    'Acompanhe o primeiro turno das eleições de 2026. Dados públicos do TSE por cargo, estado e exterior.',
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
