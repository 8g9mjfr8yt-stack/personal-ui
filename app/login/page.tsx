"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-semibold">Denný agent</h1>
        {sent ? (
          <p className="text-da-meta">
            Poslali sme ti prihlasovací odkaz na <strong>{email}</strong>.
            Skontroluj si e-mail.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tvoj@email.com"
              className="w-full rounded-md border border-da-border bg-da-card px-3 py-2 outline-none focus:border-da-meta"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-da-accent px-3 py-2 text-da-on-accent disabled:opacity-50"
            >
              {loading ? "Posielam..." : "Poslať prihlasovací odkaz"}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
