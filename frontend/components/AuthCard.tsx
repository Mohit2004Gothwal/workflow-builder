'use client';
import { useState } from 'react';
import {
  useProviderLink,
  useResetPassword,
  useSignInEmailOTP,
  useSignInEmailPassword,
  useSignUpEmailPassword,
} from '@nhost/react';

type Mode = 'code' | 'signin' | 'signup';

export default function AuthCard() {
  // Return to whichever site the login started on (localhost or the Vercel URL).
  const { google } = useProviderLink({ redirectTo: window.location.origin });
  const otp = useSignInEmailOTP();
  const { signInEmailPassword, isLoading: signingIn } = useSignInEmailPassword();
  const { signUpEmailPassword, isLoading: signingUp } = useSignUpEmailPassword();
  const { resetPassword } = useResetPassword();

  const [mode, setMode] = useState<Mode>('code');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const busy = otp.isLoading || signingIn || signingUp;

  const reset = () => { setError(''); setInfo(''); };
  const switchMode = (m: Mode) => { setMode(m); setCode(''); setCodeSent(false); reset(); };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    reset();

    if (mode === 'code') {
      if (!codeSent) {
        const r = await otp.signInEmailOTP(email);
        if (r.error) setError(r.error.message);
        else { setCodeSent(true); setInfo(`We sent a 6-digit code to ${email}.`); }
      } else {
        const r = await otp.verifyEmailOTP(email, code.trim());
        if (r.error) setError(r.error.message); // on success the app switches to the dashboard by itself
      }
      return;
    }

    if (mode === 'signin') {
      const r = await signInEmailPassword(email, password);
      if (r.needsEmailVerification) setInfo('Verify your email first. We sent you a link.');
      else if (r.error) setError(r.error.message);
    } else {
      const r = await signUpEmailPassword(email, password);
      if (r.needsEmailVerification) setInfo('Account created. Check your email and click the link to verify it.');
      else if (r.error) setError(r.error.message);
    }
  }

  async function resendCode() {
    reset();
    const r = await otp.signInEmailOTP(email);
    if (r.error) setError(r.error.message);
    else setInfo('New code sent.');
  }

  async function forgot() {
    reset();
    if (!email) return setError('Enter your email first, then click "Forgot password?"');
    const r = await resetPassword(email);
    if (r.error) setError(r.error.message);
    else setInfo('Check your email for a reset link.');
  }

  const label =
    mode === 'code' ? (codeSent ? 'Verify and sign in' : 'Email me a code')
      : mode === 'signin' ? 'Sign in' : 'Create account';

  return (
    <div className="card" id="signin">
      <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
      <p className="hint">Sign in to manage your workflows.</p>

      <a className="btn ghost wide" href={google} aria-disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z" />
          <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        Continue with Google
      </a>

      <div className="divider">or use your email</div>

      <form onSubmit={onSubmit} noValidate>
        {error && <div className="msg err" role="alert">{error}</div>}
        {info && <div className="msg ok" role="status">{info}</div>}

        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email}
            onChange={(e) => { setEmail(e.target.value); reset(); }}
            disabled={mode === 'code' && codeSent} />
        </label>

        {mode !== 'code' && (
          <label className="field">
            <span>Password</span>
            <input type="password" required value={password}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              onChange={(e) => { setPassword(e.target.value); reset(); }} />
          </label>
        )}

        {mode === 'code' && codeSent && (
          <label className="field">
            <span>6-digit code</span>
            <input className="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              required autoFocus value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
        )}

        <button className="btn wide" disabled={busy || !email || (mode === 'code' && codeSent && code.length < 6)}>
          {busy ? 'Please wait…' : label}
        </button>
      </form>

      <div className="row">
        {mode === 'code'
          ? <button type="button" className="linkbtn" onClick={() => switchMode('signin')}>Use a password instead</button>
          : <button type="button" className="linkbtn" onClick={() => switchMode('code')}>Use an email code instead</button>}
        {mode === 'signin' && <button type="button" className="linkbtn" onClick={forgot}>Forgot password?</button>}
      </div>

      {mode === 'code' && codeSent && (
        <div className="row">
          <button type="button" className="linkbtn" disabled={busy} onClick={resendCode}>Resend code</button>
          <button type="button" className="linkbtn" onClick={() => { setCodeSent(false); setCode(''); reset(); }}>Change email</button>
        </div>
      )}

      {mode !== 'code' && (
        <p className="center-note">
          {mode === 'signin' ? 'Need an account? ' : 'Already have an account? '}
          <button type="button" className="linkbtn" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      )}
    </div>
  );
}