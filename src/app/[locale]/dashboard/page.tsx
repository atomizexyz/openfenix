import { setRequestLocale, getTranslations } from "next-intl/server";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

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
        <h1 className="text-3xl font-bold gradient-text">{t("title")}</h1>
        <p className="mt-2 text-ash-500 dark:text-ash-400">
          {t("description")}
        </p>
      </div>

      <DashboardOverview />
    </div>
  );
}
