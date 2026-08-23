import { setRequestLocale, getTranslations } from "next-intl/server";
import { StakeForm } from "@/components/stake/stake-form";
import { StakesList } from "@/components/stake/stakes-list";

export default async function StakePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("stake");

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="w-fit text-3xl font-bold gradient-text">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <StakeForm />
        <StakesList />
      </div>
    </div>
  );
}
