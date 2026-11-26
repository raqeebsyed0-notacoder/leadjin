/**
 * Minimal ambient declaration for better-sqlite3.
 * The repo ships no @types/better-sqlite3 and the package has no bundled types.
 * Supports both `new Database(...)` and the `Database.Database` namespace type
 * used throughout the services, without changing any strictness flag.
 */
declare module 'better-sqlite3' {
  interface DatabaseShape {
    prepare(sql: string): any;
    pragma(...args: any[]): any;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    exec(sql: string): any;
    close(): void;
    serialize<T>(fn: () => T): T;
    parallelize<T>(fn: () => T): T;
  }

  class Database implements DatabaseShape {
    constructor(filename: string, options?: any);
    prepare(sql: string): any;
    pragma(...args: any[]): any;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    exec(sql: string): any;
    close(): void;
    serialize<T>(fn: () => T): T;
    parallelize<T>(fn: () => T): T;
  }

  namespace Database {
    type Database = DatabaseShape;
  }

  export type { Database };
  export default Database;
}
