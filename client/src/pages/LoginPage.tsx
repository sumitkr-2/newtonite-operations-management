import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Feedback';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          'Login failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemo = (email: string, password: string) => {
    setEmail(email);
    setPassword(password);
  };

  const demos = [
    {
      role: 'Admin',
      email: 'alice@newtonite.com',
      password: 'admin123',
      description: 'Full system access',
      gradient: 'from-indigo-500 to-blue-600',
    },
    {
      role: 'Manager',
      email: 'marcus@newtonite.com',
      password: 'password123',
      description: 'Team management',
      gradient: 'from-violet-500 to-fuchsia-600',
    },
    {
      role: 'Agent',
      email: 'rahul@newtonite.com',
      password: 'password123',
      description: 'Workspace access',
      gradient: 'from-cyan-500 to-blue-600',
    },
  ];

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-[#070A13] text-white">

      {/* =========================================================
          ANIMATIONS
      ========================================================= */}

      <style>{`
        @keyframes floatA {
          0%, 100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(18px, -22px, 0);
          }
        }

        @keyframes floatB {
          0%, 100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(-20px, 18px, 0);
          }
        }

        @keyframes floatC {
          0%, 100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(12px, 20px, 0);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: .25;
            transform: scale(1);
          }
          50% {
            opacity: .7;
            transform: scale(1.12);
          }
        }

        @keyframes dash {
          to {
            stroke-dashoffset: -100;
          }
        }

        @keyframes shine {
          0% {
            transform: translateX(-150%) skewX(-12deg);
          }

          60%, 100% {
            transform: translateX(350%) skewX(-12deg);
          }
        }

        .float-a {
          animation: floatA 7s ease-in-out infinite;
        }

        .float-b {
          animation: floatB 8s ease-in-out infinite;
        }

        .float-c {
          animation: floatC 9s ease-in-out infinite;
        }

        .pulse {
          animation: pulse 3s ease-in-out infinite;
        }

        .connection {
          stroke-dasharray: 5 8;
          animation: dash 8s linear infinite;
        }

        .button-shine {
          animation: shine 4s ease-in-out infinite;
        }

        /*
         * Short desktop/laptop screens.
         * The entire composition becomes more compact
         * instead of creating a vertical overflow.
         */
        @media (max-height: 760px) and (min-width: 1024px) {
          .desktop-content {
            transform: scale(0.92);
            transform-origin: center;
          }

          .desktop-visual {
            margin-top: 18px !important;
          }
        }

        @media (max-height: 680px) and (min-width: 1024px) {
          .desktop-content {
            transform: scale(0.84);
          }

          .desktop-visual {
            margin-top: 10px !important;
          }
        }

        /*
         * Very short screens.
         */
        @media (max-height: 600px) and (min-width: 768px) {
          .desktop-content {
            transform: scale(0.76);
          }
        }

        /*
         * Landscape phones.
         */
        @media (orientation: landscape) and (max-height: 500px) {
          .mobile-login-area {
            padding-top: 18px !important;
            padding-bottom: 18px !important;
          }

          .mobile-brand {
            display: none;
          }

          .mobile-card {
            max-width: 430px;
          }
        }

        /*
         * Very small portrait phones.
         */
        @media (max-height: 680px) and (max-width: 767px) {
          .mobile-login-area {
            padding-top: 78px !important;
            padding-bottom: 18px !important;
          }

          .mobile-card-content {
            padding: 20px !important;
          }

          .mobile-heading {
            margin-bottom: 18px !important;
          }

          .mobile-divider {
            margin-top: 18px !important;
            margin-bottom: 18px !important;
          }

          .mobile-demo {
            padding-top: 8px !important;
            padding-bottom: 8px !important;
          }
        }

        /*
         * Extremely narrow phones.
         */
        @media (max-width: 360px) {
          .mobile-login-area {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }

          .mobile-card-content {
            padding: 18px !important;
          }

          .mobile-heading-title {
            font-size: 21px !important;
          }
        }

        /*
         * Reduce motion for accessibility.
         */
        @media (prefers-reduced-motion: reduce) {
          .float-a,
          .float-b,
          .float-c,
          .pulse,
          .connection,
          .button-shine {
            animation: none !important;
          }
        }
      `}</style>

      {/* =========================================================
          BACKGROUND
      ========================================================= */}

      <div className="pointer-events-none fixed inset-0">

        {/* Indigo glow */}
        <div className="absolute -left-[180px] top-[5%] h-[600px] w-[600px] rounded-full bg-indigo-600/[0.10] blur-[130px]" />

        {/* Violet glow */}
        <div className="absolute -bottom-[180px] -right-[160px] h-[600px] w-[600px] rounded-full bg-violet-600/[0.10] blur-[130px]" />

        {/* Center blue glow */}
        <div className="absolute left-[42%] top-[18%] h-[320px] w-[320px] rounded-full bg-blue-500/[0.04] blur-[100px]" />

        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
          }}
        />

        {/* Decorative particles */}
        <div className="absolute left-[8%] top-[18%] h-1 w-1 rounded-full bg-white/30" />
        <div className="absolute left-[32%] top-[70%] h-1 w-1 rounded-full bg-indigo-300/40" />
        <div className="absolute right-[15%] top-[20%] h-1 w-1 rounded-full bg-violet-300/30" />
        <div className="absolute right-[32%] bottom-[16%] h-1.5 w-1.5 rounded-full bg-blue-300/30" />
      </div>

      {/* =========================================================
          HEADER
      ========================================================= */}

      <header className="absolute left-0 right-0 top-0 z-40">

        <div className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5 lg:px-10 lg:py-5">

          {/* Logo */}
          <div className="flex items-center gap-3">

            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/20 sm:h-10 sm:w-10">

              <svg
                className="h-5 w-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>

            </div>

            <div>
              <p className="text-sm font-semibold tracking-tight text-white sm:text-[15px]">
                Newtonite
              </p>

              <p className="hidden text-[9px] uppercase tracking-[0.2em] text-slate-600 sm:block">
                Work Management
              </p>
            </div>

          </div>

          {/* System status */}
          <div className="hidden items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.025] px-3 py-1.5 sm:flex">

            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />

            <span className="text-[10px] text-slate-500">
              All systems operational
            </span>

          </div>

        </div>

      </header>

      {/* =========================================================
          MAIN
      ========================================================= */}

      <main className="relative z-10 min-h-[100dvh] lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">

        {/* =======================================================
            DESKTOP LEFT SIDE
        ======================================================= */}

        <section className="relative hidden min-h-[100dvh] overflow-hidden lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-20 2xl:px-24">

          <div className="desktop-content w-full max-w-[620px]">

            {/* Badge */}
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-400/10 bg-indigo-500/[0.06] px-3 py-1.5">

              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />

              <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-indigo-300/80">
                One workspace. Every team.
              </span>

            </div>

            {/* Heading */}
            <h1 className="max-w-[600px] text-[clamp(2.25rem,4vw,3.4rem)] font-semibold leading-[1.06] tracking-[-0.04em] text-white">

              Everything your team needs,

              <span className="block bg-gradient-to-r from-indigo-400 via-violet-400 to-blue-400 bg-clip-text text-transparent">
                in one place.
              </span>

            </h1>

            {/* Description */}
            <p className="mt-4 max-w-[500px] text-[13px] leading-6 text-slate-500 xl:text-[14px]">
              Manage people, projects, tasks and workflows from a single
              workspace built to keep your entire organization moving.
            </p>

            {/* ===================================================
                WORKSPACE VISUAL
            =================================================== */}

            <div className="desktop-visual relative mt-7 h-[215px] w-full max-w-[560px] xl:mt-8 xl:h-[235px]">

              {/* Connection lines */}
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 560 235"
                fill="none"
              >

                <path
                  className="connection"
                  d="M115 60 C185 60 225 105 280 117"
                  stroke="rgba(99,102,241,.35)"
                  strokeWidth="1"
                />

                <path
                  className="connection"
                  d="M445 62 C375 62 335 105 280 117"
                  stroke="rgba(139,92,246,.35)"
                  strokeWidth="1"
                />

                <path
                  className="connection"
                  d="M135 190 C195 190 235 140 280 117"
                  stroke="rgba(34,211,238,.30)"
                  strokeWidth="1"
                />

                <circle
                  cx="280"
                  cy="117"
                  r="4"
                  fill="#6366f1"
                  opacity=".7"
                />

                <circle
                  cx="280"
                  cy="117"
                  r="12"
                  fill="#6366f1"
                  opacity=".08"
                />

              </svg>

              {/* Center workspace */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">

                <div className="pulse absolute inset-[-15px] rounded-3xl bg-indigo-500/10 blur-xl" />

                <div className="relative flex h-[78px] w-[135px] flex-col items-center justify-center rounded-2xl border border-white/[0.09] bg-[#101526]/90 shadow-2xl shadow-indigo-950/30 backdrop-blur-xl">

                  <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15">

                    <svg
                      className="h-3.5 w-3.5 text-indigo-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="3"
                      />

                      <path d="M8 12h8M8 8h5M8 16h6" />
                    </svg>

                  </div>

                  <p className="text-[11px] font-semibold text-white">
                    Newtonite
                  </p>

                  <p className="mt-0.5 text-[8px] text-slate-600">
                    Central workspace
                  </p>

                </div>

              </div>

              {/* Admin */}
              <div className="float-a absolute left-0 top-2">

                <RoleBubble
                  role="Admin"
                  description="Full control"
                  letter="A"
                  gradient="from-indigo-500 to-blue-600"
                />

              </div>

              {/* Manager */}
              <div className="float-b absolute right-0 top-3">

                <RoleBubble
                  role="Manager"
                  description="Team workspace"
                  letter="M"
                  gradient="from-violet-500 to-fuchsia-600"
                />

              </div>

              {/* Agent */}
              <div className="float-c absolute bottom-0 left-[8%]">

                <RoleBubble
                  role="Agent"
                  description="Get work done"
                  letter="A"
                  gradient="from-cyan-500 to-blue-600"
                />

              </div>

            </div>

            {/* Stats */}
            <div className="mt-1 flex items-center gap-7">

              <Stat
                value="24/7"
                label="Availability"
              />

              <div className="h-7 w-px bg-white/[0.06]" />

              <Stat
                value="3"
                label="User roles"
              />

              <div className="h-7 w-px bg-white/[0.06]" />

              <Stat
                value="1"
                label="Workspace"
              />

            </div>

          </div>

          {/* Credit */}
          <div className="absolute bottom-5 left-12 xl:left-20 2xl:left-24">

            <p className="text-[10px] text-slate-700">
              Designed & built by{' '}
              <span className="font-medium text-slate-500">
                Sumit
              </span>
            </p>

          </div>

        </section>

        {/* =======================================================
            RIGHT LOGIN
        ======================================================= */}

        <section className="mobile-login-area flex min-h-[100dvh] items-center justify-center px-4 pb-6 pt-24 sm:px-6 md:px-8 lg:min-h-[100dvh] lg:px-10 lg:py-16">

          <div className="mobile-card w-full max-w-[410px]">

            {/* Mobile heading */}
            <div className="mobile-brand mb-5 text-center lg:hidden">

              <div className="mb-3 flex justify-center">

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/20">

                  <svg
                    className="h-5 w-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>

                </div>

              </div>

              <h1 className="text-xl font-semibold text-white">
                Newtonite
              </h1>

              <p className="mt-1 text-[10px] text-slate-600">
                Work Management System
              </p>

            </div>

            {/* =================================================
                LOGIN CARD
            ================================================= */}

            <div className="mobile-card relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0d1220]/95 shadow-[0_25px_80px_rgba(0,0,0,.45)] backdrop-blur-2xl">

              {/* Top accent */}
              <div className="absolute left-1/2 top-0 h-[2px] w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

              <div className="mobile-card-content p-6 sm:p-7 lg:p-8">

                {/* Heading */}
                <div className="mobile-heading mb-6">

                  <h2 className="mobile-heading-title text-[23px] font-semibold tracking-tight text-white">
                    Welcome back
                  </h2>

                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Sign in to continue to your Newtonite workspace.
                  </p>

                </div>

                {/* Error */}
                {error && (
                  <div className="mb-4">
                    <Alert
                      type="error"
                      message={error}
                      onDismiss={() => setError('')}
                    />
                  </div>
                )}

                {/* =================================================
                    FORM
                ================================================= */}

                <form
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >

                  {/* Email */}
                  <div className="[&_input]:!border-white/[0.08] [&_input]:!bg-[#151B2B] [&_input]:!text-white [&_input]:!caret-indigo-400 [&_input]:placeholder:!text-slate-600">

                    <Input
                      label="Email address"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@newtonite.com"
                      required
                      autoComplete="email"
                    />

                  </div>

                  {/* Password */}
                  <div className="[&_input]:!border-white/[0.08] [&_input]:!bg-[#151B2B] [&_input]:!text-white [&_input]:!caret-indigo-400 [&_input]:placeholder:!text-slate-600">

                    <Input
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />

                  </div>

                  {/* Sign in */}
                  <div className="pt-1">

                    <Button
                      type="submit"
                      className="relative w-full !overflow-hidden !border-0 !bg-gradient-to-r !from-indigo-500 !via-indigo-600 !to-violet-600 shadow-lg shadow-indigo-600/20 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-xl hover:shadow-indigo-600/30"
                      isLoading={isLoading}
                      size="lg"
                    >

                      <span className="relative z-10">
                        Sign in
                      </span>

                      <span className="button-shine absolute inset-y-0 left-0 w-1/3 bg-white/10" />

                    </Button>

                  </div>

                </form>

                {/* =================================================
                    DIVIDER
                ================================================= */}

                <div className="mobile-divider my-5 flex items-center gap-3">

                  <div className="h-px flex-1 bg-white/[0.07]" />

                  <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Demo accounts
                  </span>

                  <div className="h-px flex-1 bg-white/[0.07]" />

                </div>

                {/* =================================================
                    DEMO ACCOUNTS
                ================================================= */}

                <div className="space-y-1.5">

                  {demos.map((demo) => (

                    <button
                      key={demo.email}
                      type="button"
                      onClick={() =>
                        fillDemo(
                          demo.email,
                          demo.password
                        )
                      }
                      className="mobile-demo group flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition-all duration-200 hover:border-indigo-400/20 hover:bg-white/[0.045]"
                    >

                      <div className="flex items-center gap-3">

                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${demo.gradient}`}
                        >

                          <span className="text-[10px] font-bold text-white">
                            {demo.role.charAt(0)}
                          </span>

                        </div>

                        <div className="min-w-0 text-left">

                          <p className="text-xs font-semibold text-slate-200">
                            {demo.role}
                          </p>

                          <p className="mt-0.5 truncate text-[9px] text-slate-600">
                            {demo.description}
                          </p>

                        </div>

                      </div>

                      <svg
                        className="h-3.5 w-3.5 shrink-0 text-slate-700 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>

                    </button>

                  ))}

                </div>

              </div>

              {/* Card footer */}
              <div className="border-t border-white/[0.06] bg-black/10 px-6 py-3">

                <div className="flex items-center justify-center gap-2">

                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />

                  <span className="text-[9px] text-slate-600">
                    Secure Newtonite workspace
                  </span>

                </div>

              </div>

            </div>

            {/* Mobile credit */}
            <p className="mt-3 text-center text-[10px] text-slate-700 lg:hidden">

              Designed & built by{' '}

              <span className="font-medium text-slate-500">
                Sumit
              </span>

            </p>

          </div>

        </section>

      </main>

    </div>
  );
}


/* ===============================================================
   ROLE BUBBLE
================================================================ */

function RoleBubble({
  role,
  description,
  letter,
  gradient,
}: {
  role: string;
  description: string;
  letter: string;
  gradient: string;
}) {
  return (
    <div className="group relative flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#111727]/90 px-3.5 py-2.5 shadow-xl shadow-black/20 backdrop-blur-xl transition-transform duration-300 hover:scale-105">

      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-lg`}
      >

        <span className="text-[11px] font-bold text-white">
          {letter}
        </span>

      </div>

      <div>

        <p className="text-[11px] font-semibold text-white">
          {role}
        </p>

        <p className="mt-0.5 text-[9px] text-slate-600">
          {description}
        </p>

      </div>

      {/* Online indicator */}
      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#070A13] bg-emerald-400 shadow-sm shadow-emerald-400/50" />

    </div>
  );
}


/* ===============================================================
   STAT
================================================================ */

function Stat({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div>

      <p className="text-sm font-semibold text-slate-300">
        {value}
      </p>

      <p className="mt-0.5 text-[8px] uppercase tracking-[0.15em] text-slate-700">
        {label}
      </p>

    </div>
  );
}