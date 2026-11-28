import './globals.css';

export const metadata = {
  title: 'Robot Monitor Belajar — Cloud Dashboard',
  description: 'Sistem pendamping belajar pencegah distraksi berbasis ESP32, Next.js, dan Neon PostgreSQL',
  themeColor: '#0b1120'
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}