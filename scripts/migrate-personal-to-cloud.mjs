import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Pool } from "pg";

const local = parseEnv(await readFile(".env", "utf8"));
const cloud = parseEnv(await readFile(".env.cloudflare.local", "utf8"));
if (!local.DATABASE_URL || !cloud.DIRECT_URL)
  throw new Error("缺少本地或云端数据库连接配置");

const source = new Pool({ connectionString: local.DATABASE_URL, max: 1 });
const target = new Pool({ connectionString: cloud.DIRECT_URL, max: 1 });
const jsonColumns = new Map();
const tables = [
  "Account",
  "Application",
  "Draft",
  "Event",
  "FileAsset",
  "Interview",
  "Material",
  "MaterialRole",
  "NotificationJob",
  "Preparation",
  "Resume",
  "Settings",
];
const quote = (name) => `"${name.replaceAll('"', '""')}"`;

async function insert(client, table, row) {
  const columns = Object.keys(row);
  const values = columns.map((column) =>
    jsonColumns.get(table)?.has(column) && row[column] !== null
      ? JSON.stringify(row[column])
      : row[column],
  );
  const placeholders = values.map((_, index) => `$${index + 1}`);
  await client.query(
    `insert into ${quote(table)} (${columns.map(quote).join(",")}) values (${placeholders.join(",")})`,
    values,
  );
}

try {
  const types = await source.query(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and data_type in ('json', 'jsonb')`,
  );
  for (const row of types.rows) {
    const columns = jsonColumns.get(row.table_name) || new Set();
    columns.add(row.column_name);
    jsonColumns.set(row.table_name, columns);
  }
  const users = await source.query(
    `select * from "User" where email <> 'demo@career.local'`,
  );
  if (users.rowCount !== 1)
    throw new Error(`预期恰好一个个人账号，实际为 ${users.rowCount}`);
  const existing = await target.query(
    `select count(*)::int as count from "User"`,
  );
  if (existing.rows[0].count !== 0)
    throw new Error("云端数据库已有账号，为避免覆盖已停止迁移");

  const user = users.rows[0];
  const client = await target.connect();
  try {
    await client.query("begin");
    await insert(client, "User", user);
    for (const table of tables) {
      const result = await source.query(
        `select * from ${quote(table)} where "userId" = $1`,
        [user.id],
      );
      for (const row of result.rows) await insert(client, table, row);
      console.log(`${table}: ${result.rowCount}`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  console.log("个人账号与业务记录迁移完成");
} finally {
  await Promise.all([source.end(), target.end()]);
}
