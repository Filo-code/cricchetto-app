import { LoginForm, WhatsAppSupportButton } from "./login-form";

export default function LoginPage() {
  const supportNumber = process.env.Criccheto_SUPPORT_WHATSAPP_NUMBER ?? null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Filò-style ambient accent orb */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.05] blur-[120px]" />
        <div className="absolute left-[35%] top-[25%] h-[200px] w-[200px] rounded-full bg-accent/[0.03] blur-[70px]" />
      </div>

      {/* Top accent line — matches dashboard shell */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" aria-hidden />

      <div className="relative z-10 w-full max-w-sm">
        <div className="glass-panel rounded-2xl p-7 sm:p-8">
          {/* Brand lockup */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <img
                src="/brand/criccheto-logo-symbol.svg"
                alt="Cricchetto"
                className="h-16 w-auto mix-blend-screen"
                width={388}
                height={189}
              />
            </div>
            <p className="mt-2 text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-600">
              by Filò · Dashboard officina
            </p>
          </div>

          <LoginForm showForgotPassword={!!(process.env.Criccheto_SMTP_HOST && process.env.Criccheto_SMTP_USER && process.env.Criccheto_SMTP_PASS)} />
        </div>

        {supportNumber ? (
          <WhatsAppSupportButton number={supportNumber} />
        ) : null}

        {/* Footer branding */}
        <p className="mt-6 text-center text-[10px] font-mono tracking-[0.15em] uppercase text-zinc-700">
          Powered by Filò
        </p>
      </div>
    </main>
  );
}
