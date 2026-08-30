import {parse as parseYaml,stringify as stringifyYaml} from "yaml";
import {z} from "zod";
import type {Account} from "@/modules/identity/account";
import type {ListingState} from "@/modules/listing/listing";
import type {ListingService} from "@/application/listings";
import type {ListingMediaService} from "@/application/listing-media";
import type {ListingMediaRepository} from "@/modules/listing-media/media";
import {fetchRemoteImage} from "@/application/remote-image";

const mediaSchema=z.object({url:z.url(),alt_text:z.string().max(500).default(""),position:z.number().int().min(0)}).strict();
const recordSchema=z.object({id:z.uuid().optional(),external_key:z.string().max(128).optional(),title:z.string().min(1),description:z.string().default(""),price_minor:z.string().regex(/^[0-9]+$/),currency:z.string().regex(/^[A-Z]{3}$/),destination:z.url(),metadata:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).default({}),state:z.enum(["draft","published","archived"]).default("draft"),media:z.array(mediaSchema).max(20).default([])}).strict();
export type ListingTransferRecord=z.infer<typeof recordSchema>;
export type TransferFormat="json"|"csv"|"yaml";

export class ListingTransferService {
  constructor(private listings:ListingService,private media:ListingMediaService,private mediaRepository:ListingMediaRepository){}
  async export(owner:Account){const records:ListingTransferRecord[]=[];let cursor:string|undefined;do{const page=await this.listings.queryOwner(owner,{cursor,limit:100});const media=await this.mediaRepository.listByListings(page.items.map(item=>item.id));for(const listing of page.items)records.push({id:listing.id,external_key:listing.externalKey??undefined,title:listing.title,description:listing.description,price_minor:listing.price.minorAmount.toString(),currency:listing.price.currency,destination:listing.destination,metadata:{...listing.metadata},state:listing.state,media:(media.get(listing.id)??[]).map(item=>({url:this.media.publicUrl(item),alt_text:item.altText,position:item.position}))});cursor=page.nextCursor??undefined;}while(cursor);return records;}
  async import(owner:Account,input:{format:TransferFormat;body:string;mode:"create"|"upsert"}){
    const raw=parseTransfer(input.body,input.format);if(!Array.isArray(raw)||raw.length>1000)throw new Error("Import must contain a list of at most 1000 listings");
    const result={total:raw.length,created:0,updated:0,skipped:0,failed:0,records:[] as {index:number;status:string;listing_id?:string;code?:string;message?:string}[]};
    for(let index=0;index<raw.length;index++){try{const record=recordSchema.parse(raw[index]);let existing=null;if(input.mode==="upsert"){if(record.external_key)existing=await this.listings.findByExternalKey(owner,record.external_key);else if(record.id){try{existing=await this.listings.getOwner(owner,record.id);}catch{throw new Error("Upsert identity does not belong to the authenticated owner");}}else throw new Error("Upsert requires external_key or an owned listing id");}
      const status=existing?"updated":"created";let listing;if(existing)listing=await this.listings.update(owner,existing.id,{title:record.title,description:record.description,priceMinor:record.price_minor,currency:record.currency,destination:record.destination,metadata:record.metadata});else listing=await this.listings.create(owner,{title:record.title,description:record.description,priceMinor:record.price_minor,currency:record.currency,destination:record.destination,metadata:record.metadata,externalKey:record.external_key});
      await this.applyState(owner,listing.id,listing.state,record.state);for(const image of [...record.media].sort((a,b)=>a.position-b.position)){const downloaded=await fetchRemoteImage(image.url);await this.media.create(owner,listing.id,{...downloaded,altText:image.alt_text,position:image.position});}
      if(existing)result.updated++;else result.created++;result.records.push({index,status,listing_id:listing.id});
    }catch(error){result.failed++;result.records.push({index,status:"failed",code:"listing_import_failed",message:safeError(error)});}}
    return result;
  }
  private async applyState(owner:Account,id:string,current:ListingState,target:ListingState){if(target==="draft")return;if(target==="published"){if(current==="archived"){await this.listings.restore(owner,id);current="draft";}if(current!=="published")await this.listings.publish(owner,id);return;}if(target==="archived")await this.listings.archive(owner,id);}
}

export function parseTransfer(body:string,format:TransferFormat):unknown {if(Buffer.byteLength(body)>5*1024*1024)throw new Error("Import exceeds the 5 MiB limit");if(format==="json")return JSON.parse(body);if(format==="yaml"){if(/!!|(^|\s)[&*][A-Za-z0-9_-]+/.test(body))throw new Error("YAML tags and aliases are not allowed");return parseYaml(body,{schema:"core",maxAliasCount:0});}return parseCsv(body);}
export function serializeTransfer(records:ListingTransferRecord[],format:TransferFormat){if(format==="json")return JSON.stringify(records,null,2);if(format==="yaml")return stringifyYaml(records,{aliasDuplicateObjects:false});return writeCsv(records);}
const columns=["id","external_key","title","description","price_minor","currency","destination","metadata","state","media"] as const;
function writeCsv(records:ListingTransferRecord[]){return [columns.join(","),...records.map(record=>columns.map(column=>csvCell(column==="metadata"||column==="media"?JSON.stringify(record[column]):String(record[column]??""))).join(","))].join("\n")+"\n";}
function csvCell(value:string){const safe=/^[=+\-@]/.test(value)?`'${value}`:value;return `"${safe.replaceAll('"','""')}"`;}
function parseCsv(body:string){const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;const push=()=>{row.push(cell.replace(/\r$/,"").replace(/^'(?=[=+\-@])/,""));cell="";};for(let i=0;i<body.length;i++){const c=body[i];if(quoted){if(c==='"'&&body[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===",")push();else if(c==="\n"){push();rows.push(row);row=[];}else cell+=c;if(rows.length>1001||cell.length>1_000_000)throw new Error("CSV input exceeds parser limits");}if(quoted)throw new Error("Malformed CSV quotation");if(cell||row.length){push();rows.push(row);}const header=rows.shift();if(!header||columns.some((column,index)=>header[index]!==column))throw new Error("CSV header is invalid");return rows.filter(values=>values.some(Boolean)).map(values=>Object.fromEntries(columns.map((column,index)=>[column,column==="metadata"||column==="media"?JSON.parse(values[index]||(column==="media"?"[]":"{}")):(column==="id"||column==="external_key")?(values[index]||undefined):values[index]])));}
const safeError=(error:unknown)=>error instanceof z.ZodError?`${error.issues[0]?.path.join(".")||"record"}: ${error.issues[0]?.message}`:(error instanceof Error?error.message:"Import failed");
