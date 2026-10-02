"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api-client";
import type { BlogCategory } from "@/modules/blog/domain/blog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { CrudEdit } from "@/components/crud/edit";
import { CrudIndex } from "@/components/crud/index-page";
import type { CrudColumn } from "@/components/crud/table";
import { OperatorPrimaryCell } from "../ui/data-cells";
import { useCrudCollection } from "@/components/crud/use-collection";
import type { CrudBulkAction } from "@/components/crud/bulk-actions";
import { runOperatorBulkAction } from "@/app/operator/bulk-actions";
import { OperatorErrorState } from "../ui/error-state";
import { OperatorBulkOutcome, type OperatorBulkOutcomeData } from "../ui/bulk-outcome";
import { useToast } from "@/components/toast/provider";

export function OperatorBlogCategories({ canDelete = false }: { canDelete?: boolean }) {
  const toast = useToast();
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<OperatorBulkOutcomeData | null>(null);
  const collection = useCrudCollection(async () => {
    const result = await apiFetch<{ items: BlogCategory[] }>("/api/blog/categories");
    return { items: result.items, nextCursor: null };
  }, {});
  async function remove(category: BlogCategory) {
    if (!window.confirm(`Delete category “${category.name}”?`)) return;
    setActionError(null);
    setBulkOutcome(null);
    try {
      await apiFetch(`/api/blog/categories/${category.id}`, { method: "DELETE" });
      await collection.retry();
      toast.success("Category deleted.");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete category.");
    }
  }
  async function removeMany(categories: readonly BlogCategory[]) {
    if (!window.confirm(`Delete ${categories.length} selected blog categories?`)) return false;
    setActionError(null);
    setBulkOutcome(null);
    try {
      const results = await runOperatorBulkAction({
        resource: "blog-categories",
        action: "delete",
        ids: categories.map((category) => category.id),
      });
      const failures = results.failed;
      if (failures.length)
        setBulkOutcome({
          resource: "blog categories",
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
  const bulkActions: readonly CrudBulkAction<BlogCategory>[] = canDelete
    ? [{ value: "delete", label: "Delete", destructive: true, onSelect: removeMany }]
    : [];
  const columns: readonly CrudColumn<BlogCategory>[] = [
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
      eyebrow="Content operations"
      title="Blog categories"
      description="Manage categories assigned to public articles. Categories in use cannot be removed."
      createAction={{ label: "New category", href: "/operator/blog/categories/new" }}
      items={collection.items}
      columns={columns}
      getRowKey={(category) => category.id}
      selection={
        canDelete ? { labelForItem: (category) => `blog category ${category.name}` } : undefined
      }
      bulkActions={bulkActions}
      beforeTable={
        <div className="grid gap-3">
          {actionError && <OperatorErrorState message={actionError} />}
          {bulkOutcome && <OperatorBulkOutcome outcome={bulkOutcome} />}
        </div>
      }
      actions={(category) => [
        { type: "link", label: "Edit", href: `/operator/blog/categories/${category.id}` },
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
      emptyTitle="No categories yet"
      emptyDescription="Create a category to organize blog articles."
      emptyAction={
        <Button asChild>
          <Link href="/operator/blog/categories/new">Create category</Link>
        </Button>
      }
    />
  );
}

export function OperatorBlogCategoryEditor({ initial }: { initial?: BlogCategory }) {
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
      await apiFetch<BlogCategory>(
        initial ? `/api/blog/categories/${initial.id}` : "/api/blog/categories",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            ...(initial ? (slug !== initial.slug ? { slug } : {}) : slug.trim() ? { slug } : {}),
          }),
        },
      );
      toast.success(initial ? "Category updated." : "Category created.");
      router.push("/operator/blog/categories");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save category.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <CrudEdit
      mode={initial ? "edit" : "create"}
      backHref="/operator/blog/categories"
      eyebrow="Content operations"
      title={initial ? "Edit category" : "New category"}
      description="Categories are managed separately and selected by posts."
      saving={saving}
      onSubmit={submit}
      error={error}
      submitLabel="Save category"
      savingLabel="Saving…"
      sectionTitle="Category details"
    >
      <div>
        <Label htmlFor="category-name">Name</Label>
        <Input
          id="category-name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="category-slug">Slug</Label>
        <Input
          id="category-slug"
          value={slug}
          maxLength={120}
          onChange={(event) => setSlug(event.target.value)}
          placeholder="generated-from-name"
          aria-describedby="category-slug-help"
        />
        <p id="category-slug-help" className="mt-1 text-sm text-slate-600">
          Use lowercase letters, numbers, and single hyphens. Leaving this blank on creation
          generates it from the category name; renaming never changes an existing slug.
        </p>
      </div>
    </CrudEdit>
  );
}
