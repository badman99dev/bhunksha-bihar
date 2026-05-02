import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BhuNaksha Bihar - High Quality Map Downloader',
  description: 'Download high-quality village maps from BhuNaksha Bihar',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
