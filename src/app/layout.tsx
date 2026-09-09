//import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata = {
  title: 'PulseScreener',
  description: 'Real-time stock screening terminal',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
