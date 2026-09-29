import { DomainInvariantError } from "@/kernel/errors";
import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";

export type ListingState = "draft" | "published" | "archived";
export type ListingVisibility = "public" | "authenticated";
export type ListingCategorySummary = Readonly<{ id: Id; name: string; slug: string }>;
export type ListingSort = "date" | "price" | "title" | "rating";
export type ListingSortDirection = "asc" | "desc";
export type ListingMetadata = Readonly<Record<string, string | number | boolean | null>>;
export const LISTING_SHORT_DESCRIPTION_MAX_LENGTH = 200;

export class Listing {
  private constructor(
    readonly id: Id,
    readonly sellerId: Id,
    private titleValue: string,
    private shortDescriptionValue: string,
    private longDescriptionValue: string,
    private priceValue: Money,
    private compareAtPriceValue: Money | null,
    private visibilityValue: ListingVisibility,
    private categoriesValue: readonly ListingCategorySummary[],
    private destinationValue: URL,
    private metadataValue: ListingMetadata,
    private stateValue: ListingState,
    readonly externalKey: string | null,
    private featuredPositionValue: number | null,
  ) {}

  static create(input: {
    id: Id;
    sellerId: Id;
    title: string;
    shortDescription: string;
    longDescription: string;
    price: Money;
    destination: string;
    metadata?: ListingMetadata;
    externalKey?: string | null;
    featuredPosition?: number | null;
    compareAtPrice?: Money | null;
    visibility?: ListingVisibility;
    categories?: readonly ListingCategorySummary[];
  }): Listing {
    const title = input.title.trim();
    if (!title) throw new DomainInvariantError("Listing title is required");
    const destination = new URL(input.destination);
    if (!["http:", "https:"].includes(destination.protocol))
      throw new DomainInvariantError("Listing destination must use HTTP or HTTPS");
    return new Listing(
      input.id,
      input.sellerId,
      title,
      normalizeShortDescription(input.shortDescription),
      input.longDescription.trim(),
      input.price,
      validateCompareAtPrice(input.price, input.compareAtPrice ?? null),
      validateVisibility(input.visibility ?? "public"),
      normalizeCategories(input.categories ?? []),
      destination,
      normalizeMetadata(input.metadata ?? {}),
      "draft",
      validateExternalKey(input.externalKey ?? null),
      validateFeaturedPosition(input.featuredPosition ?? null),
    );
  }

  static restore(input: {
    id: Id;
    sellerId: Id;
    title: string;
    shortDescription: string;
    longDescription: string;
    price: Money;
    destination: string;
    metadata: ListingMetadata;
    state: ListingState;
    externalKey?: string | null;
    featuredPosition?: number | null;
    compareAtPrice?: Money | null;
    visibility?: ListingVisibility;
    categories?: readonly ListingCategorySummary[];
  }): Listing {
    return new Listing(
      input.id,
      input.sellerId,
      input.title,
      normalizeShortDescription(input.shortDescription),
      input.longDescription,
      input.price,
      validateCompareAtPrice(input.price, input.compareAtPrice ?? null),
      validateVisibility(input.visibility ?? "public"),
      normalizeCategories(input.categories ?? []),
      new URL(input.destination),
      normalizeMetadata(input.metadata),
      input.state,
      validateExternalKey(input.externalKey ?? null),
      validateFeaturedPosition(input.featuredPosition ?? null),
    );
  }

  publish(): void {
    if (this.stateValue !== "draft")
      throw new DomainInvariantError("Only a draft listing can be published");
    ensurePublishedShortDescription(this.shortDescriptionValue);
    this.stateValue = "published";
  }

  archive(): void {
    if (this.stateValue === "archived") return;
    this.stateValue = "archived";
  }
  restore(): void {
    if (this.stateValue !== "archived")
      throw new DomainInvariantError("Only an archived listing can be restored");
    this.stateValue = "draft";
  }

  update(input: {
    title: string;
    shortDescription: string;
    longDescription: string;
    price: Money;
    destination: string;
    metadata: ListingMetadata;
    featuredPosition?: number | null;
    compareAtPrice?: Money | null;
    visibility?: ListingVisibility;
    categories?: readonly ListingCategorySummary[];
  }): void {
    const title = input.title.trim();
    if (!title) throw new DomainInvariantError("Listing title is required");
    const destination = new URL(input.destination);
    if (!["http:", "https:"].includes(destination.protocol))
      throw new DomainInvariantError("Listing destination must use HTTP or HTTPS");
    const shortDescription = normalizeShortDescription(input.shortDescription);
    if (this.stateValue === "published") ensurePublishedShortDescription(shortDescription);
    this.titleValue = title;
    this.shortDescriptionValue = shortDescription;
    this.longDescriptionValue = input.longDescription.trim();
    this.priceValue = input.price;
    this.compareAtPriceValue = validateCompareAtPrice(input.price, input.compareAtPrice ?? null);
    this.visibilityValue = validateVisibility(input.visibility ?? this.visibilityValue);
    this.categoriesValue = normalizeCategories(input.categories ?? this.categoriesValue);
    this.destinationValue = destination;
    this.metadataValue = normalizeMetadata(input.metadata);
    this.featuredPositionValue = validateFeaturedPosition(input.featuredPosition ?? null);
  }

  get state() {
    return this.stateValue;
  }
  get destination() {
    return this.destinationValue.toString();
  }
  get title() {
    return this.titleValue;
  }
  get shortDescription() {
    return this.shortDescriptionValue;
  }
  get longDescription() {
    return this.longDescriptionValue;
  }
  get price() {
    return this.priceValue;
  }
  get compareAtPrice() {
    return this.compareAtPriceValue;
  }
  get visibility() {
    return this.visibilityValue;
  }
  get categories() {
    return this.categoriesValue;
  }
  get metadata() {
    return this.metadataValue;
  }
  get featuredPosition() {
    return this.featuredPositionValue;
  }

  commercialSnapshot() {
    if (this.stateValue !== "published")
      throw new DomainInvariantError("Only a published listing can be purchased");
    return Object.freeze({
      listingId: this.id,
      sellerId: this.sellerId,
      title: this.titleValue,
      price: this.priceValue.snapshot(),
      shortDescription: this.shortDescriptionValue,
      longDescription: this.longDescriptionValue,
    });
  }
}

function normalizeShortDescription(value: string) {
  const normalized = value.trim();
  if (normalized.length > LISTING_SHORT_DESCRIPTION_MAX_LENGTH)
    throw new DomainInvariantError(
      `Listing short description must be ${LISTING_SHORT_DESCRIPTION_MAX_LENGTH} characters or fewer`,
    );
  return normalized;
}

function ensurePublishedShortDescription(value: string) {
  if (!value) throw new DomainInvariantError("Published listing short description is required");
}

export interface ListingRepository {
  findById(id: Id): Promise<Listing | null>;
  findByExternalKey(sellerId: Id, key: string): Promise<Listing | null>;
  query(input: {
    sellerId?: Id;
    publicOnly?: boolean;
    state?: ListingState;
    search?: string;
    cursor?: string;
    sort?: ListingSort;
    direction?: ListingSortDirection;
    featuredOnly?: boolean;
    visibility?: ListingVisibility | "all";
    limit: number;
  }): Promise<{ items: readonly Listing[]; nextCursor: string | null }>;
  save(listing: Listing): Promise<void>;
}

function validateCompareAtPrice(price: Money, compareAtPrice: Money | null) {
  if (compareAtPrice && compareAtPrice.currency !== price.currency)
    throw new DomainInvariantError("Compare-at price must use the listing currency");
  if (compareAtPrice && compareAtPrice.minorAmount <= price.minorAmount)
    throw new DomainInvariantError("Compare-at price must be greater than the listing price");
  return compareAtPrice;
}

function validateVisibility(value: string): ListingVisibility {
  if (value !== "public" && value !== "authenticated")
    throw new DomainInvariantError("Listing visibility must be public or authenticated");
  return value;
}

function normalizeCategories(categories: readonly ListingCategorySummary[]) {
  const byId = new Map(categories.map((category) => [category.id, Object.freeze({ ...category })]));
  return Object.freeze(
    [...byId.values()].sort((a, b) => {
      const left = a.name.toLowerCase();
      const right = b.name.toLowerCase();
      return (left < right ? -1 : left > right ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }),
  );
}

function normalizeMetadata(metadata: ListingMetadata): ListingMetadata {
  if (!("category" in metadata)) return metadata;
  const miscellaneous = { ...metadata };
  delete miscellaneous.category;
  return Object.freeze(miscellaneous);
}

function validateExternalKey(value: string | null) {
  if (value !== null && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
    throw new DomainInvariantError("Listing external key is invalid");
  return value;
}

function validateFeaturedPosition(value: number | null) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value <= 0)
    throw new DomainInvariantError("Featured position must be a positive integer");
  return value;
}
