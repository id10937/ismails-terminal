export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: "#0a0a0a", color: "white" }}>
        {children}
      </body>
    </html>
  )
}
