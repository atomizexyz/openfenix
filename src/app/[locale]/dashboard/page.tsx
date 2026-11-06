import { setRequestLocale, getTranslations } from "next-intl/server";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/metadata";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata(locale, "dashboard");
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="w-fit text-3xl font-bold gradient-text">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <Suspense fallback={
        <div className="space-y-4" aria-busy="true" aria-label={t("title")}>
          <Skeleton className="h-10 w-44 rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-40 rounded-2xl" />
            ))}
          </div>
        </div>
      }>
        <DashboardOverview />
      </Suspense>
    </div>
  );
}
