export const metadata = {
  title: 'PM-OS OAuth',
  description: 'OAuth callback handler for PM-OS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
