import "server-only";

import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";

declare global {
  var __hrBoardPostgresPool: Pool | undefined;
  var __hrBoardPostgresSchemaPromise: Promise<void> | undefined;
}

export function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function queryPostgres<T extends QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  await ensurePostgresSchema();

  try {
    return await getPostgresPool().query<T>(text, values);
  } catch (error) {
    if (!isTransientPostgresError(error)) {
      throw error;
    }

    await resetPostgresPool();
    await ensurePostgresSchema();
    return getPostgresPool().query<T>(text, values);
  }
}

export async function withPostgresTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
) {
  await ensurePostgresSchema();

  try {
    return await runPostgresTransaction(callback);
  } catch (error) {
    if (!isTransientPostgresError(error)) {
      throw error;
    }

    await resetPostgresPool();
    await ensurePostgresSchema();
    return runPostgresTransaction(callback);
  }
}

async function runPostgresTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
) {
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function ensurePostgresSchema() {
  if (!isPostgresConfigured()) {
    return;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!global.__hrBoardPostgresSchemaPromise) {
      global.__hrBoardPostgresSchemaPromise = createSchema();
    }

    try {
      await global.__hrBoardPostgresSchemaPromise;
      return;
    } catch (error) {
      global.__hrBoardPostgresSchemaPromise = undefined;

      if (!isTransientPostgresError(error) || attempt === 1) {
        throw error;
      }

      await resetPostgresPool();
    }
  }
}

function getPostgresPool() {
  if (!isPostgresConfigured()) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!global.__hrBoardPostgresPool) {
    global.__hrBoardPostgresPool = new Pool(buildPoolConfig());
    global.__hrBoardPostgresPool.on("error", () => {
      global.__hrBoardPostgresSchemaPromise = undefined;
      global.__hrBoardPostgresPool = undefined;
    });
  }

  return global.__hrBoardPostgresPool;
}

function buildPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return {
    connectionString,
    max: parseInteger(process.env.PG_POOL_MAX, 10),
    connectionTimeoutMillis: parseInteger(process.env.PG_CONNECTION_TIMEOUT_MS, 15000),
    idleTimeoutMillis: parseInteger(process.env.PG_IDLE_TIMEOUT_MS, 30000),
    keepAlive: true,
    ssl: resolveSslConfig(connectionString),
  };
}

async function createSchema() {
  const pool = getPostgresPool();

  const statements = [
    `
    CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id TEXT PRIMARY KEY,
      settings JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS workspace_access_records (
      workspace_id TEXT PRIMARY KEY,
      contact_email TEXT NOT NULL DEFAULT '',
      access_key_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS workspace_access_reset_requests (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ NULL,
      resolved_by TEXT NOT NULL DEFAULT ''
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_workspace_access_reset_requests_status_created
      ON workspace_access_reset_requests (status, created_at DESC)
    `,
    `
    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'invited',
      access_key_hash TEXT NOT NULL,
      invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workspace_id, email)
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_status
      ON workspace_members (workspace_id, status, invited_at DESC)
    `,
    `
    CREATE TABLE IF NOT EXISTS hiring_forms (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      team TEXT NOT NULL DEFAULT '',
      intro TEXT NOT NULL DEFAULT '',
      analysis_goal TEXT NOT NULL DEFAULT '',
      role_setup JSONB NOT NULL DEFAULT '{}'::jsonb,
      custom_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
      form_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      workspace JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NULL,
      published BOOLEAN NOT NULL DEFAULT TRUE,
      jd_attachment JSONB NULL
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_hiring_forms_workspace_created_at
      ON hiring_forms (workspace_id, created_at DESC)
    `,
    `
    ALTER TABLE hiring_forms
      ADD COLUMN IF NOT EXISTS form_fields JSONB NOT NULL DEFAULT '[]'::jsonb
    `,
    `
    ALTER TABLE hiring_forms
      ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE
    `,
    `
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      input_kind TEXT NOT NULL,
      binary_data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_uploaded_files_workspace_created_at
      ON uploaded_files (workspace_id, created_at DESC)
    `,
    `
    CREATE TABLE IF NOT EXISTS hiring_applications (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      form_id TEXT NOT NULL REFERENCES hiring_forms(id) ON DELETE CASCADE,
      upload_id TEXT NULL REFERENCES uploaded_files(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applicant JSONB NOT NULL DEFAULT '{}'::jsonb,
      analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
      resume_file JSONB NOT NULL DEFAULT '{}'::jsonb
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_hiring_applications_workspace_form_created_at
      ON hiring_applications (workspace_id, form_id, created_at DESC)
    `,
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function resetPostgresPool() {
  const pool = global.__hrBoardPostgresPool;

  global.__hrBoardPostgresSchemaPromise = undefined;
  global.__hrBoardPostgresPool = undefined;

  if (pool) {
    await pool.end().catch(() => undefined);
  }
}

function isTransientPostgresError(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes("connection terminated") ||
    message.includes("connection timeout") ||
    message.includes("connection ended") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("terminating connection")
  );
}

function resolveSslConfig(connectionString: string) {
  const sslSetting = process.env.DATABASE_SSL?.trim().toLowerCase();

  if (sslSetting && ["0", "false", "disable", "off"].includes(sslSetting)) {
    return undefined;
  }

  if (sslSetting && ["1", "true", "require", "on"].includes(sslSetting)) {
    return { rejectUnauthorized: false };
  }

  try {
    const parsedUrl = new URL(connectionString);
    const sslMode = parsedUrl.searchParams.get("sslmode")?.toLowerCase();

    if (sslMode && sslMode !== "disable") {
      return { rejectUnauthorized: false };
    }

    if (process.env.RENDER === "true") {
      return undefined;
    }

    if (["localhost", "127.0.0.1"].includes(parsedUrl.hostname)) {
      return undefined;
    }
  } catch {
    return process.env.RENDER === "true" ? undefined : { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: false };
}

function parseInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
