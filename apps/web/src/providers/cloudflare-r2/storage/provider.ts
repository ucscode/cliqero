import {createHash,createHmac} from "node:crypto";
import type {ObjectLocator,ObjectStorageProvider} from "@/modules/listing-media/storage";

export class CloudflareR2ObjectStorageProvider implements ObjectStorageProvider {
  readonly name="cloudflare-r2";
  constructor(private endpoint:string,private bucket:string,private publicBaseUrl:string,private accessKeyId:string,private secretAccessKey:string,private transport:typeof fetch=fetch){}
  async put(input:{key:string;bytes:Uint8Array;mimeType:string}){const response=await this.request("PUT",input.key,input.bytes,input.mimeType);if(!response.ok)throw new Error(`Cloudflare R2 upload failed (${response.status})`);return {provider:this.name,container:this.bucket,key:input.key,byteSize:input.bytes.byteLength,mimeType:input.mimeType};}
  async delete(locator:ObjectLocator){const response=await this.request("DELETE",locator.key,new Uint8Array(),"application/octet-stream");if(!response.ok&&response.status!==404)throw new Error(`Cloudflare R2 deletion failed (${response.status})`);}
  publicUrl(locator:ObjectLocator){return `${this.publicBaseUrl.replace(/\/$/,"")}/${locator.key.split("/").map(encodeURIComponent).join("/")}`;}
  private async request(method:string,key:string,body:Uint8Array,contentType:string){
    const url=new URL(`${this.endpoint.replace(/\/$/,"")}/${encodeURIComponent(this.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`);
    const now=new Date(),date=now.toISOString().replace(/[:-]|\.\d{3}/g,""),day=date.slice(0,8),payload=sha(body);
    const headers=`content-type:${contentType}\nhost:${url.host}\nx-amz-content-sha256:${payload}\nx-amz-date:${date}\n`,signed="content-type;host;x-amz-content-sha256;x-amz-date";
    const canonical=`${method}\n${url.pathname}\n\n${headers}\n${signed}\n${payload}`,scope=`${day}/auto/s3/aws4_request`,toSign=`AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha(toBytes(canonical))}`;
    const signingKey=hmac(hmac(hmac(hmac(toBytes(`AWS4${this.secretAccessKey}`),day),"auto"),"s3"),"aws4_request");
    const signature=Buffer.from(hmac(signingKey,toSign)).toString("hex");
    return this.transport(url,{method,headers:{"content-type":contentType,"x-amz-content-sha256":payload,"x-amz-date":date,authorization:`AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`},body:method==="DELETE"?undefined:body as unknown as BodyInit});
  }
}
const toBytes=(value:string)=>new TextEncoder().encode(value);const sha=(value:Uint8Array)=>createHash("sha256").update(value).digest("hex");const hmac=(key:Uint8Array,value:string)=>new Uint8Array(createHmac("sha256",key).update(value).digest());
