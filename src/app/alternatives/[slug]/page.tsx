import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AlternativePage from "@/components/AlternativePage";
import { alternatives, getAlternative } from "@/data/alternatives";
import { absoluteUrl, SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return alternatives.map((alternative) => ({ slug: alternative.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const alternative = getAlternative(slug);
  if (!alternative) return {};

  const title = alternative.seoTitle;
  const url = absoluteUrl(`/alternatives/${alternative.slug}`);
  const image = absoluteUrl("/opengraph-image");

  return {
    title,
    description: alternative.metaDescription,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: alternative.metaDescription,
      url,
      type: "article",
      siteName: SITE_NAME,
      images: [{ url: image, width: 1200, height: 630, alt: "AP MED Mentors editorial guide" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: alternative.metaDescription,
      images: [image],
    },
  };
}

export default async function AlternativeRoute({ params }: Props) {
  const { slug } = await params;
  const alternative = getAlternative(slug);
  if (!alternative) notFound();
  return <AlternativePage alternative={alternative} />;
}
