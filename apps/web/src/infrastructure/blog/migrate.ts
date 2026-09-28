import { getBlogDatabase, blogDatabasePath } from "./database";

// Opening the database applies every sorted, unapplied Blog SQLite migration.
getBlogDatabase();
console.log(`Blog SQLite migrations applied at ${blogDatabasePath()}`);
