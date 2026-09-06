import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef } from "react";
import { siteConfig } from "@/config/site";

export function SiteName() {
  return <>{siteConfig.name}</>;
}

export function SupportEmail() {
  return (
    <a
      href={`mailto:${siteConfig.supportEmail}`}
      className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
    >
      {siteConfig.supportEmail}
    </a>
  );
}

const components: MDXComponents = {
  SiteName,
  SupportEmail,
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="mt-10 text-2xl font-semibold tracking-tight text-slate-900" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mt-8 text-xl font-semibold text-slate-900" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="my-4 leading-7 text-slate-700" {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a
      className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
      {...props}
    />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="my-5 list-disc space-y-2 pl-6 text-slate-700" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol className="my-5 list-decimal space-y-2 pl-6 text-slate-700" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="my-6 border-l-4 border-emerald-200 pl-4 italic text-slate-600"
      {...props}
    />
  ),
  code: (props: ComponentPropsWithoutRef<"code">) => (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em] text-slate-800" {...props} />
  ),
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="my-6 max-w-full overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm leading-6 text-slate-100"
      {...props}
    />
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="my-6 max-w-full overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm" {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-900" {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700" {...props} />
  ),
  img: (props: ComponentPropsWithoutRef<"img">) => (
    // Trusted repository content may reference remote images; constrain them to the article.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="my-6 h-auto max-w-full rounded-lg" {...props} alt={props.alt ?? ""} />
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
