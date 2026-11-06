import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { FlushCountdownDisplay } from "./flush-countdown";
import { FenixLogo } from "@/components/icons";
import { RisingAsh } from "@/components/effects/rising-ash";

// Warm ambient light behind the ash. Pure CSS keyframes on transform, so the
// drift runs on the compositor; the radial gradient is already soft, so no
// blur filter (which would be re-rasterised every frame) is needed.
const ORB_CONFIG = [
  { size: 360, x: "15%", y: "20%", delay: 0, duration: 18, color: "rgba(249, 115, 22, 0.15)" },
  { size: 280, x: "75%", y: "60%", delay: -2, duration: 22, color: "rgba(239, 68, 68, 0.12)" },
  { size: 220, x: "50%", y: "30%", delay: -4, duration: 16, color: "rgba(245, 158, 11, 0.10)" },
  { size: 320, x: "85%", y: "15%", delay: -1, duration: 20, color: "rgba(249, 115, 22, 0.08)" },
  { size: 240, x: "25%", y: "75%", delay: -3, duration: 24, color: "rgba(220, 38, 38, 0.10)" },
];

function FloatingOrbs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {ORB_CONFIG.map((orb, i) => (
        <div
          key={i}
          className="hero-orb absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            animationDuration: `${orb.duration}s`,
            animationDelay: `${orb.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export function HeroSection() {
  const t = useTranslations("hero");

  return (
    <section className="relative isolate flex min-h-[85vh] items-center justify-center overflow-hidden bg-fenix-50/40 px-4 py-20 dark:bg-transparent sm:px-6 lg:px-8">
      {/* Background effects */}
      <div
        aria-hidden="true"
        className="hero-sunset pointer-events-none absolute inset-0 dark:hidden"
      />
      <FloatingOrbs />
      <RisingAsh />

      {/* Lens vignette over the ash, dark theme only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(10,10,10,0.85)_70%)] dark:block"
      />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        {/* Icon */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-fenix-500 to-ember-500 shadow-lg shadow-fenix-500/30 sm:h-20 sm:w-20">
              <FenixLogo className="h-10 w-10 sm:h-12 sm:w-12 [&_path]:fill-white" />
            </div>
            {/* Glow ring */}
            <div
              className="hero-glow absolute -inset-2 rounded-2xl bg-gradient-to-br from-fenix-500/20 to-ember-500/20 blur-lg"
            />
          </div>
        </div>

        {/* Title */}
        <h1
          className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
        >
          <span className="gradient-text">{t("title")}</span>
        </h1>

        {/* Subtitle */}
        <p
          className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-foreground-secondary sm:text-xl"
        >
          {t("subtitle")}
        </p>

        {/* CTA Buttons */}
        <div
          className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Button asChild size="lg" className="min-w-[180px]">
            <Link href="/burn">
              <FenixLogo className="h-4 w-4 [&_path]:fill-current" />
              {t("cta_burn")}
            </Link>
          </Button>

          <Button asChild variant="outline" size="lg" className="min-w-[180px]">
            <a href="#features">
              {t("cta_learn")}
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>

        {/* Flush Countdown */}
        <div className="mt-8 flex h-14 items-center justify-center">
          <FlushCountdownDisplay />
        </div>

        {/* Decorative bottom gradient line */}
        <div
          className="mx-auto mt-16 h-px w-full max-w-md bg-gradient-to-r from-transparent via-fenix-500/50 to-transparent"
        />
      </div>
    </section>
  );
}
