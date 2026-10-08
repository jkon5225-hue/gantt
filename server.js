import express from "express";
import pg from "pg";
import cors from "cors";

const { Pool } = pg;

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL 接続設定
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "gantt_db",
  password: "", // SQL設定したパスワードに変更
  port: 5432,
});

// テーブル初期化および初回シードデータ投入処理
async function initDB() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      progress INT DEFAULT 0,
      dependencies TEXT
    );
  `;
  await pool.query(createTableQuery);

  const res = await pool.query("SELECT COUNT(*) FROM tasks");
  if (parseInt(res.rows[0].count, 10) === 0) {
    console.log("初回起動: 初期データを PostgreSQL に登録します");
    const initialTasks = [
      ["SCRIPT_PROJECT", "環境構築自動化プログラム開発 (Python)", "2026-10-01", "2026-10-15", 0, ""],
      ["REQUIREMENTS_AND_TOOLS", "Python環境設定・標準モジュール選定", "2026-10-01", "2026-10-02", 0, "SCRIPT_PROJECT"],
      ["PG_SETUP_LOGIC", "subprocessによるPostgreSQLサービス・接続処理", "2026-10-03", "2026-10-06", 0, "REQUIREMENTS_AND_TOOLS"],
      ["SCHEMA_MIGRATION_LOGIC", "psycopg2/SQLファイル連携による初期作成処理", "2026-10-07", "2026-10-10", 0, "PG_SETUP_LOGIC"],
      ["ERROR_LOGGING_HANDLING", "loggingによるログ出力・例外処理実装", "2026-10-11", "2026-10-12", 0, "SCHEMA_MIGRATION_LOGIC"],
      ["SCRIPT_TEST_AND_VERIFY", "スクリプト単体実行・復元テスト動作検証", "2026-10-13", "2026-10-15", 0, "ERROR_LOGGING_HANDLING"]
    ];

    for (const task of initialTasks) {
      await pool.query(
        "INSERT INTO tasks (id, name, start_date, end_date, progress, dependencies) VALUES ($1, $2, $3, $4, $5, $6)",
        task
      );
    }
  }
}

initDB().catch(console.error);

// 1. タスク一覧取得 (GET)
app.get("/api/tasks", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tasks ORDER BY id ASC");
    const tasks = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      start: row.start_date.toISOString().split("T")[0],
      end: row.end_date.toISOString().split("T")[0],
      progress: row.progress,
      dependencies: row.dependencies || "",
    }));
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. 新規タスク追加 (POST)
app.post("/api/tasks", async (req, res) => {
  const { id, name, start, end, progress, dependencies } = req.body;
  try {
    await pool.query(
      "INSERT INTO tasks (id, name, start_date, end_date, progress, dependencies) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, name, start, end, progress || 0, dependencies || ""]
    );
    res.status(201).json({ message: "Created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. タスク更新 (PUT)
app.put("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { name, start, end, progress, dependencies } = req.body;

  try {
    if (name !== undefined) await pool.query("UPDATE tasks SET name=$1 WHERE id=$2", [name, id]);
    if (start !== undefined) await pool.query("UPDATE tasks SET start_date=$1 WHERE id=$2", [start, id]);
    if (end !== undefined) await pool.query("UPDATE tasks SET end_date=$1 WHERE id=$2", [end, id]);
    if (progress !== undefined) await pool.query("UPDATE tasks SET progress=$1 WHERE id=$2", [progress, id]);
    if (dependencies !== undefined) await pool.query("UPDATE tasks SET dependencies=$1 WHERE id=$2", [dependencies, id]);

    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. タスク削除 (DELETE)
app.delete("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM tasks WHERE id=$1", [id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("API Server is running on port 3001");
});