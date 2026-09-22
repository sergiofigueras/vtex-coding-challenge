declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function statSync(path: string): { isFile(): boolean; size: number };
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}

declare module 'node:sqlite' {
  interface StatementSync {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): { lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare const process: {
  argv: string[];
  cwd(): string;
  exitCode?: number;
  hrtime: { bigint(): bigint };
  stdout: { write(value: string): boolean };
  stderr: { write(value: string): boolean };
};
