import { DomainInvariantError } from "@/kernel/errors";
import type { Id } from "@/kernel/ids";
import { Money } from "@/modules/money/money";

export type ListingState = "draft" | "published" | "archived";
export type ListingMetadata = Readonly<Record<string, string | number | boolean | null>>;

export class Listing {
  private constructor(
    readonly id: Id,
    readonly sellerId: Id,
    private titleValue: string,
    private descriptionValue: string,
    private priceValue: Money,
    private destinationValue: URL,
    private metadataValue: ListingMetadata,
    private stateValue: ListingState,
    readonly externalKey: string | null,
  ) {}

  static create(input: {
    id: Id; sellerId: Id; title: string; description: string; price: Money;
    destination: string; metadata?: ListingMetadata; externalKey?:string|null;
  }): Listing {
    const title = input.title.trim();
    if (!title) throw new DomainInvariantError("Listing title is required");
    const destination = new URL(input.destination);
    if (!['http:', 'https:'].includes(destination.protocol)) throw new DomainInvariantError("Listing destination must use HTTP or HTTPS");
    return new Listing(input.id, input.sellerId, title, input.description.trim(), input.price, destination, input.metadata ?? {}, "draft",validateExternalKey(input.externalKey??null));
  }

  static restore(input: {
    id: Id; sellerId: Id; title: string; description: string; price: Money;
    destination: string; metadata: ListingMetadata; state: ListingState; externalKey?:string|null;
  }): Listing {
    return new Listing(input.id, input.sellerId, input.title, input.description, input.price, new URL(input.destination), input.metadata, input.state,validateExternalKey(input.externalKey??null));
  }

  publish(): void {
    if (this.stateValue !== "draft") throw new DomainInvariantError("Only a draft listing can be published");
    this.stateValue = "published";
  }

  archive():void {if(this.stateValue==="archived")return;this.stateValue="archived";}
  restore():void {if(this.stateValue!=="archived")throw new DomainInvariantError("Only an archived listing can be restored");this.stateValue="draft";}

  update(input: { title: string; description: string; price: Money; destination: string; metadata: ListingMetadata }): void {
    const title = input.title.trim();
    if (!title) throw new DomainInvariantError("Listing title is required");
    const destination = new URL(input.destination);
    if (!["http:", "https:"].includes(destination.protocol)) throw new DomainInvariantError("Listing destination must use HTTP or HTTPS");
    this.titleValue = title;
    this.descriptionValue = input.description.trim();
    this.priceValue = input.price;
    this.destinationValue = destination;
    this.metadataValue = input.metadata;
  }

  get state() { return this.stateValue; }
  get destination() { return this.destinationValue.toString(); }
  get title() { return this.titleValue; }
  get description() { return this.descriptionValue; }
  get price() { return this.priceValue; }
  get metadata() { return this.metadataValue; }

  commercialSnapshot() {
    if (this.stateValue !== "published") throw new DomainInvariantError("Only a published listing can be purchased");
    return Object.freeze({
      listingId: this.id,
      sellerId: this.sellerId,
      title: this.titleValue,
      price: this.priceValue.snapshot(),
    });
  }
}

export interface ListingRepository {
  findById(id: Id): Promise<Listing | null>;
  findByExternalKey(sellerId:Id,key:string):Promise<Listing|null>;
  query(input:{sellerId?:Id;publicOnly?:boolean;state?:ListingState;search?:string;cursor?:string;limit:number}):Promise<{items:readonly Listing[];nextCursor:string|null}>;
  save(listing: Listing): Promise<void>;
}

function validateExternalKey(value:string|null){if(value!==null&&!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))throw new DomainInvariantError("Listing external key is invalid");return value;}
