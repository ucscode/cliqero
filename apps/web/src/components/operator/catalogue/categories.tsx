"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api-client";
import type { ListingCategory } from "@/modules/listing/category/category";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudEdit } from "@/components/crud/edit";
import { CrudIndex } from "@/components/crud/index-page";
import type { CrudColumn } from "@/components/crud/table";
import { OperatorPrimaryCell } from "@/components/operator/ui/data-cells";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";

export function OperatorListingCategories() {
  const [error, setError] = useState<string | null>(null);
  const collection = useCrudCollection(async () => {
    const result = await apiFetch<{ items: ListingCategory[] }>(
      "/api/operator/catalogue/categories",
    );
    return { items: result.items, nextCursor: null };
  }, {});

  async function remove(category: ListingCategory) {
    if (
      !window.confirm(`Delete category “${category.name}”? Assigned categories cannot be deleted.`)
    )
      return;
    setError(null);
    try {
      await apiFetch(`/api/operator/catalogue/categories/${category.id}`, { method: "DELETE" });
      await collection.retry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete category.");
    }
  }
  async function removeMany(categories: readonly ListingCategory[]) {
    if (!window.confirm(`Delete ${categories.length} selected catalogue categories?`)) return false;
    setError(null);
    try {
      const results = await Promise.all(
        categories.map(async (category) => {
          try {
            await apiFetch(`/api/operator/catalogue/categories/${category.id}`, {
              method: "DELETE",
            });
            return { category, success: true as const };
          } catch (cause) {
            return {
              category,
              success: false as const,
              error: cause instanceof Error ? cause.message : "Unable to delete category.",
            };
          }
        }),
      );
      const failures = results.filter((result) => !result.success);
      if (failures.length)
        setError(
          `${failures.length} of ${results.length} categories could not be deleted: ${failures
            .map(({ category, error }) => `${category.name}: ${error}`)
            .filter(Boolean)
            .join("; ")}`,
        );
      await collection.retry();
      return failures.length === 0;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete selected categories.");
      return false;
    }
  }
  const bulkActions: readonly CrudBulkAction<ListingCategory>[] = [
    { value: "delete", label: "Delete", destructive: true, onSelect: removeMany },
  ];

  const columns: readonly CrudColumn<ListingCategory>[] = [
    {
      key: "name",
      label: "Category",
      primary: true,
      render: (category) => (
        <OperatorPrimaryCell title={category.name} subtitle={`/${category.slug}`} />
      ),
    },
  ];

  return (
    <CrudIndex
      eyebrow="Catalogue operations"
      title="Catalogue categories"
      description="Manage categories assigned to catalogue listings. Categories in use cannot be removed."
      createAction={{ label: "New category", href: "/operator/catalogue/categories/new" }}
      items={collection.items}
      columns={columns}
      getRowKey={(category) => category.id}
      selection={{ labelForItem: (category) => `catalogue category ${category.name}` }}
      bulkActions={bulkActions}
      actions={(category) => [
        { type: "link", label: "Edit", href: `/operator/catalogue/categories/${category.id}` },
        {
          type: "action",
          label: "Delete",
          destructive: true,
          onSelect: () => void remove(category),
        },
      ]}
      actionLabel={(category) => `Actions for category ${category.name}`}
      loading={collection.loading}
      initialized={collection.initialized}
      error={error ?? collection.error}
      onRetry={() => {
        setError(null);
        void collection.retry();
      }}
      emptyTitle="No catalogue categories yet"
      emptyDescription="Create a category to organize catalogue listings."
      emptyAction={
        <Button asChild size="sm">
          <Link href="/operator/catalogue/categories/new">Create category</Link>
        </Button>
      }
    />
  );
}

export function OperatorListingCategoryEditor({ initial }: { initial?: ListingCategory }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch<ListingCategory>(
        initial
          ? `/api/operator/catalogue/categories/${initial.id}`
          : "/api/operator/catalogue/categories",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            ...(!initial && slug.trim()
              ? { slug }
              : initial && slug.trim() && slug !== initial.slug
                ? { slug }
                : {}),
          }),
        },
      );
      router.push("/operator/catalogue/categories");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CrudEdit
      mode={initial ? "edit" : "create"}
      backHref="/operator/catalogue/categories"
      eyebrow="Catalogue operations"
      title={initial ? "Edit category" : "New category"}
      description="Categories are shared by catalogue listings and are stored independently from listing metadata."
      saving={saving}
      onSubmit={submit}
      error={error}
      submitLabel="Save category"
      savingLabel="Saving…"
      sectionTitle="Category details"
    >
      <div>
        <Label htmlFor="catalogue-category-name">Name</Label>
        <Input
          id="catalogue-category-name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="catalogue-category-slug">Slug</Label>
        <Input
          id="catalogue-category-slug"
          value={slug}
          maxLength={120}
          onChange={(event) => setSlug(event.target.value)}
          placeholder="generated-from-name"
        />
        <p className="mt-1 text-sm text-slate-600">
          Lowercase letters, numbers, and single hyphens. Leaving blank on creation generates a
          slug; renaming does not change an existing slug.
        </p>
      </div>
    </CrudEdit>
  );
}
