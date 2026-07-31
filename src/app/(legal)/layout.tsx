import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span aria-hidden className="pulse-dot h-2 w-2 rounded-full bg-live" />
          <span className="text-sm font-semibold tracking-tight text-ink-900">
            Social <span className="font-mono text-accent">Pulse</span>
          </span>
        </Link>
        <Link href="/" className="text-xs font-medium text-accent hover:underline">
          ← Volver a la app
        </Link>
      </header>

      <article className="flex flex-col gap-6 text-sm leading-relaxed text-ink-600">
        {children}
      </article>
    </main>
  );
}
