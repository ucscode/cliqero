import { BlogService } from "@/application/blog/service";
import { getBlogDatabase } from "./database";
import { SqliteBlogRepository } from "./repository";

let service: BlogService | undefined;

export function getBlogService(): BlogService {
  return (service ??= new BlogService(new SqliteBlogRepository(getBlogDatabase().sqlite)));
}
