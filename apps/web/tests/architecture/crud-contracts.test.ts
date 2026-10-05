import { describe, expect, it } from "vitest";
import { BlogCategoryService } from "@/application/blog/categories";
import { BlogTagService } from "@/application/blog/tags";
import { BlogService } from "@/application/blog/service";
import { ListingCategoryService } from "@/application/listing/category/service";
import { ListingReviewService } from "@/application/listing/reviews";
import { ListingService } from "@/application/listing/service";
import { OperatorAccountManagementService } from "@/application/operator/accounts";
import { OperatorApiKeyService } from "@/application/operator/api-keys";
import { WithdrawalService } from "@/application/withdrawal/service";
import { SqliteBlogCategoryRepository } from "@/infrastructure/blog/category-repository";
import { SqliteBlogTagRepository } from "@/infrastructure/blog/tag-repository";
import { SqliteBlogRepository } from "@/infrastructure/blog/repository";
import { PostgresListingCategoryRepository } from "@/infrastructure/postgres/listing/categories";
import { PostgresListingRepository } from "@/infrastructure/postgres/listing/repository";
import { PostgresListingReviewRepository } from "@/infrastructure/postgres/listing/reviews";
import { PostgresWithdrawalRepository } from "@/infrastructure/postgres/withdrawal/withdrawals";
import { ApiKeyService } from "@/infrastructure/postgres/api-keys";
import { CrudRepository, CrudService } from "@/kernel/crud";

describe("shared CRUD contracts", () => {
  it("backs ordinary resource services with the canonical CRUD base", () => {
    const services = [
      ListingService,
      ListingCategoryService,
      ListingReviewService,
      OperatorAccountManagementService,
      OperatorApiKeyService,
      WithdrawalService,
      BlogService,
      BlogCategoryService,
      BlogTagService,
    ];

    for (const service of services) expect(service.prototype).toBeInstanceOf(CrudService);
  });

  it("backs concrete persistence adapters with the canonical repository base", () => {
    const repositories = [
      PostgresListingRepository,
      PostgresListingCategoryRepository,
      PostgresListingReviewRepository,
      PostgresWithdrawalRepository,
      ApiKeyService,
      SqliteBlogRepository,
      SqliteBlogCategoryRepository,
      SqliteBlogTagRepository,
    ];

    for (const repository of repositories)
      expect(repository.prototype).toBeInstanceOf(CrudRepository);
  });
});
