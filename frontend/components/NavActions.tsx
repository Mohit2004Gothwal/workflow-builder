'use client';
import Link from 'next/link';
import { useAuthenticationStatus, useSignOut } from '@nhost/react';

export default function NavActions() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const { signOut } = useSignOut();

  if (isLoading) return null;

  return isAuthenticated ? (
    <>
      <Link href="/">Dashboard</Link>
      <button className="btn ghost" style={{ padding: '8px 16px' }} onClick={() => signOut()}>
        Sign out
      </button>
    </>
  ) : (
    <Link href="/#signin" className="btn ghost" style={{ padding: '8px 16px' }}>
      Sign in
    </Link>
  );
}