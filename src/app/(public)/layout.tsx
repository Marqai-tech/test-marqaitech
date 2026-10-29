// Toaster is mounted ONCE globally in src/app/layout.tsx.
// Do NOT add a <Toaster> here — that causes every toast to fire twice.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
