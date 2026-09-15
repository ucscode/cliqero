import { BlogService } from "@/application/blog/service";
import { getBlogDatabase } from "./database";

let service: BlogService | undefined;

export function getBlogService(): BlogService {
  return (service ??= new BlogService(getBlogDatabase().sqlite));
}
