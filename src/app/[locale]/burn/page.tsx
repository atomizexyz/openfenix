import { setRequestLocale, getTranslations } from "next-intl/server";
import { BurnForm } from "@/components/burn/burn-form";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata(locale, "burn");
}

export default async function BurnPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("burn");

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="w-fit text-3xl font-bold gradient-text">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <BurnForm />
    </div>
  );
}
