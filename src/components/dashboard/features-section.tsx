import { useTranslations } from "next-intl";
import { Flame, TrendingUp, Shield, Infinity } from "lucide-react";

const features = [
  { icon: Flame, key: "burn" as const, gradient: "from-fenix-500 to-ember-500" },
  { icon: TrendingUp, key: "stake" as const, gradient: "from-amber-500 to-fenix-500" },
  { icon: Shield, key: "yield" as const, gradient: "from-emerald-500 to-teal-500" },
  { icon: Infinity, key: "hyper" as const, gradient: "from-violet-500 to-purple-500" },
];

export function FeaturesSection() {
  const t = useTranslations("features");

  return (
    <section id="features" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <div
            key={feature.key}
            className="glow-card group p-6"
          >
            <div
              className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${feature.gradient} p-3 shadow-lg`}
            >
              <feature.icon className="h-6 w-6 text-white" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              {t(`${feature.key}_title`)}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(`${feature.key}_desc`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
