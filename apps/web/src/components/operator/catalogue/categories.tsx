"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api-client";
import type { ListingCategory } from "@/modules/listing/category/category";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, RequiredLabel } from "@/components/ui/label";
import { CrudEdit } from "@/components/crud/edit";
import { CrudIndex } from "@/components/crud/index-page";
import type { CrudColumn } from "@/components/crud/table";
import { OperatorPrimaryCell } from "@/components/operator/ui/data-cells";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import { useOperatorConfirmation } from "../ui/confirmation";
import { OperatorErrorState } from "@/components/operator/ui/error-state";
import {
  OperatorBulkOutcome,
  type OperatorBulkOutcomeData,
} from "@/components/operator/ui/bulk-outcome";
import { useToast } from "@/components/toast/provider";

export function OperatorListingCategories({ canDelete = false }: { canDelete?: boolean }) {
  const confirm = useOperatorConfirmation();
  const toast = useToast();
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const collection = useCrudCollection(async () => {
    const result = await apiFetch<{ items: ListingCategory[] }>("/api/catalogue/categories");
    return { items: result.items, nextCursor: null };
  }, {});

  async function remove(category: ListingCategory) {
    if (
      !(await confirm({
        title: "Delete category?",
        description: `Delete category “${category.name}”? Its listing assignments will be removed.`,
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    setActionError(null);
    setBulkOutcome(null);
    try {
      const result = await runOperatorBulkAction({
        resource: "catalogue-categories",
        action: "delete",
        ids: [category.id],
      });
      if (result.failed.length) throw new Error(result.failed[0]!.message);
      await collection.retry();
      toast.success("Category deleted.");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete category.");
    }
  }
  async function removeMany(categories: readonly ListingCategory[]) {
    if (
      !(await confirm({
        title: "Delete categories?",
        description: `Delete ${categories.length} selected catalogue categories?`,
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return false;
    setActionError(null);
    setBulkOutcome(null);
    try {
      const results = await runOperatorBulkAction({
        resource: "catalogue-categories",
        action: "delete",
        ids: categories.map((category) => category.id),
      });
      const failures = results.failed;
      if (failures.length)
        setBulkOutcome({
          resource: "catalogue categories",
          selectedCount: categories.length,
          failures: failures.map(({ id, message }) => ({
            id,
            label: categories.find((category) => category.id === id)?.name ?? id,
            message,
          })),
        });
      await collection.retry();
      if (!failures.length) toast.success("Selected categories deleted.");
      return failures.length === 0;
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Unable to delete selected categories.",
      );
      return false;
    }
  }
  const bulkActions: readonly CrudBulkAction<ListingCategory>[] = canDelete
    ? [{ value: "delete", label: "Delete", destructive: true, onSelect: removeMany }]
    : [];

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
      description="Manage categories assigned to catalogue listings."
      createAction={{ label: "New category", href: "/operator/catalogue/categories/new" }}
      items={collection.items}
      columns={columns}
      getRowKey={(category) => category.id}
      selection={
        canDelete
          ? { labelForItem: (category) => `catalogue category ${category.name}` }
          : undefined
      }
      bulkActions={bulkActions}
      beforeTable={
        <div className="grid gap-3">
          {actionError && <OperatorErrorState message={actionError} />}
          {bulkOutcome && <OperatorBulkOutcome outcome={bulkOutcome} />}
        </div>
      }
      actions={(category) => [
        { type: "link", label: "Edit", href: `/operator/catalogue/categories/${category.id}` },
        ...(canDelete
          ? [
              {
                type: "action" as const,
                label: "Delete",
                destructive: true,
                onSelect: () => void remove(category),
              },
            ]
          : []),
      ]}
      actionLabel={(category) => `Actions for category ${category.name}`}
      loading={collection.loading}
      initialized={collection.initialized}
      error={collection.error}
      onRetry={() => {
        void collection.retry();
      }}
      emptyTitle="No catalogue categories yet"
      emptyDescription="Create a category to organize catalogue listings."
      emptyAction={
        <Button asChild>
          <Link href="/operator/catalogue/categories/new">Create category</Link>
        </Button>
      }
    />
  );
}

export function OperatorListingCategoryEditor({ initial }: { initial?: ListingCategory }) {
  const router = useRouter();
  const toast = useToast();
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
        initial ? `/api/catalogue/categories/${initial.id}` : "/api/catalogue/categories",
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
      toast.success(initial ? "Category updated." : "Category created.");
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
        <RequiredLabel htmlFor="catalogue-category-name">Name</RequiredLabel>
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
