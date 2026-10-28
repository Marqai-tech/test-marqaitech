import { Toaster } from 'react-hot-toast';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster position="top-center" toastOptions={{ duration: 4000, style: { background: '#fff', color: '#0F172A', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '12px 16px', fontSize: '14px', maxWidth: '90vw' } }} />
    </>
  );
}
