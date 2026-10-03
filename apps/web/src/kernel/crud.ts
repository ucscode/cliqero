/**
 * CRUD service contract with operation-specific argument tuples so services can
 * retain explicit actor/context inputs without inventing alternate verbs.
 */
export abstract class CrudService<
  CreateArgs extends unknown[] = [input: unknown],
  GetArgs extends unknown[] = [id: string],
  UpdateArgs extends unknown[] = [id: string, input: unknown],
  DeleteArgs extends unknown[] = [id: string],
  CreateResult = unknown,
  GetResult = unknown,
  UpdateResult = unknown,
  DeleteResult = unknown,
> {
  abstract create(...args: CreateArgs): CreateResult;
  abstract get(...args: GetArgs): GetResult;
  abstract update(...args: UpdateArgs): UpdateResult;
  abstract delete(...args: DeleteArgs): DeleteResult;
}

/** Persistence CRUD vocabulary; specialized queries may extend this contract. */
export abstract class CrudRepository<
  CreateArgs extends unknown[] = [input: unknown],
  FindArgs extends unknown[] = [id: string],
  UpdateArgs extends unknown[] = [id: string, input: unknown],
  DeleteArgs extends unknown[] = [id: string],
  CreateResult = unknown,
  FindResult = unknown,
  UpdateResult = unknown,
  DeleteResult = unknown,
> {
  abstract create(...args: CreateArgs): CreateResult;
  abstract findById(...args: FindArgs): FindResult;
  abstract update(...args: UpdateArgs): UpdateResult;
  abstract delete(...args: DeleteArgs): DeleteResult;
}
