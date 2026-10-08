import { useEffect, useRef, useState } from "react";
import Gantt from "frappe-gantt";
import "./App.css";

type Task = {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  dependencies?: string;
};

const API_BASE_URL = "http://localhost:3001/api/tasks";

function App() {
  const ganttRef = useRef<HTMLDivElement>(null);
  const ganttInstance = useRef<any>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // ガントチャートの明示的リフレッシュ制御用キー
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // モーダル・編集状態管理
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // フォーム入力値
  const [formData, setFormData] = useState<Task>({
    id: "",
    name: "",
    start: "",
    end: "",
    progress: 0,
    dependencies: "",
  });

  // --- 1. PostgreSQLからタスク一覧を取得 ---
  const fetchTasks = async (shouldRefreshGantt = false) => {
    try {
      const res = await fetch(API_BASE_URL);
      const data = await res.json();
      setTasks(data);
      if (shouldRefreshGantt) {
        setRefreshKey((prev) => prev + 1);
      }
    } catch (err) {
      console.error("タスクの取得に失敗しました:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks(true);
  }, []);

  // --- 2. ガントチャートの初期化・再描画 ---
  useEffect(() => {
    if (!ganttRef.current || loading || tasks.length === 0) return;

    // 既存のSVG要素をクリーンアップ
    ganttRef.current.innerHTML = "";

    const ganttHeight = tasks.length * 60 + 100;

    ganttInstance.current = new Gantt(
      ganttRef.current,
      tasks.map((task) => ({ ...task })),
      {
        view_mode: "Day",
        date_format: "YYYY-MM-DD",
        language: "ja",
        header_height: 70,
        bar_height: 30,
        bar_corner_radius: 3,
        column_width: 45,
        padding: 18,
        container_height: ganttHeight,
        move_dependencies: true,
        today_button: true,

        custom_popup_html: (task: any) => {
          return `
            <div class="popup" style="padding: 10px; background: #fff; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
              <strong>${task.name}</strong><br>
              開始：${formatDate(task._start)}<br>
              終了：${formatDate(task._end)}<br>
              進捗：${task.progress}%
            </div>
          `;
        },

        /* ▼ ドラッグによる日付変更（移動・リサイズ）時の処理 ▼ */
        on_date_change: async (task: any, start: Date, end: Date) => {
          const rawStart = formatDate(start);
          const rawEnd = formatDate(end);

          // 画面表示用（ドラッグ位置の見た目をそのまま反映）
          const updatedStart = addDays(rawStart, 0);
          const updatedEnd = addDays(rawEnd, 0);

          // DB保存用（編集ボタン保存と同様に 1日加算して補正）
          const dbStart = addDays(rawStart, 1);
          const dbEnd = addDays(rawEnd, 1);

          // 1. React の State を更新（データテーブルに即座に反映）
          setTasks((prevTasks) =>
            prevTasks.map((t) =>
              t.id === task.id
                ? { ...t, start: updatedStart, end: updatedEnd }
                : t
            )
          );

          // 2. frappe-gantt が内部で持つオブジェクトの値も更新
          task.start = updatedStart;
          task.end = updatedEnd;

          try {
            // 3. DBへは 1日加算した値を送信して保存
            await fetch(`${API_BASE_URL}/${task.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                start: dbStart,
                end: dbEnd,
              }),
            });
          } catch (err) {
            console.error("日付更新エラー:", err);
            // エラー時のみ全データを再取得して巻き戻し
            fetchTasks(true);
          }
        },

        /* ▼ 進捗バーのドラッグ変更時の処理 ▼ */
        on_progress_change: async (task: any, progress: number) => {
          setTasks((prevTasks) =>
            prevTasks.map((t) =>
              t.id === task.id ? { ...t, progress } : t
            )
          );

          try {
            await fetch(`${API_BASE_URL}/${task.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ progress }),
            });
          } catch (err) {
            console.error("進捗更新エラー:", err);
          }
        },
      } as any
    );

    return () => {
      if (ganttRef.current) {
        ganttRef.current.innerHTML = "";
      }
      ganttInstance.current = null;
    };
  }, [refreshKey, loading]);

  // --- 3. タスク新規追加モーダル表示 ---
  const handleOpenCreateModal = () => {
    setEditingTask(null);
    const today = new Date();
    setFormData({
      id: `TASK_${Date.now().toString().slice(-4)}`,
      name: "",
      start: formatDate(today),
      end: formatDate(new Date(Date.now() + 86400000 * 3)),
      progress: 0,
      dependencies: "",
    });
    setIsModalOpen(true);
  };

  // --- 4. タスク修正モーダル表示 ---
  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({ ...task });
    setIsModalOpen(true);
  };

  // --- 5. タスクの保存 (新規作成 / 編集) ---
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      ...formData,
      start: addDays(formData.start, 1),
      end: addDays(formData.end, 1),
    };

    try {
      if (editingTask) {
        await fetch(`${API_BASE_URL}/${editingTask.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(API_BASE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      setIsModalOpen(false);
      await fetchTasks(true);
    } catch (err) {
      console.error("保存失敗:", err);
    }
  };

  // --- 6. タスク削除（関連する依存項目の自動クリア付き） ---
  const handleDeleteTask = async (id: string) => {
    if (!window.confirm(`タスク [${id}] を削除しますか？`)) return;

    try {
      // 対象タスクの削除
      await fetch(`${API_BASE_URL}/${id}`, {
        method: "DELETE",
      });

      // 削除されたタスクIDを依存関係に持つ他のタスクを抽出して更新
      const affectedTasks = tasks.filter((t) => {
        if (!t.dependencies || t.id === id) return false;
        const deps = t.dependencies.split(",").map((d) => d.trim());
        return deps.includes(id);
      });

      // 関連タスクの dependencies から削除対象IDを取り除いて DB を更新
      await Promise.all(
        affectedTasks.map((task) => {
          const newDeps = task.dependencies!
            .split(",")
            .map((d) => d.trim())
            .filter((d) => d !== id)
            .join(", ");

          return fetch(`${API_BASE_URL}/${task.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dependencies: newDeps }),
          });
        })
      );

      // 全体を再取得してガントチャートを再描画
      await fetchTasks(true);
    } catch (err) {
      console.error("削除処理に失敗しました:", err);
    }
  };

  if (loading) {
    return (
      <div className="app">
        <p>PostgreSQL データベースから読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <h1>PostgreSQL連携 ガントチャート</h1>
        <button className="create-button" onClick={handleOpenCreateModal}>
          + 新規タスク追加
        </button>
      </div>

      <div className="description">
        バーの移動・幅の変更（ドラッグ）で期間調整ができます。新規追加・修正・削除も即座にDBへ永続化されます。
      </div>

      <div className="gantt-host">
        <div ref={ganttRef} />
      </div>

      <div className="task-table">
        <h2>タスク一覧・操作</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>タスク名</th>
              <th>開始日</th>
              <th>終了日</th>
              <th>進捗</th>
              <th>依存</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.id}</td>
                <td>{task.name}</td>
                <td>{task.start}</td>
                <td>{task.end}</td>
                <td>{Math.round(task.progress)}%</td>
                <td>{task.dependencies || "-"}</td>
                <td>
                  <button
                    className="edit-btn"
                    onClick={() => handleOpenEditModal(task)}
                  >
                    編集
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteTask(task.id)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 新規追加 / 編集モーダル */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{editingTask ? "タスク修正" : "新規タスク追加"}</h3>
            <form onSubmit={handleSaveTask}>
              <label>
                ID:
                <input
                  type="text"
                  value={formData.id}
                  disabled={!!editingTask}
                  onChange={(e) =>
                    setFormData({ ...formData, id: e.target.value })
                  }
                  required
                />
              </label>

              <label>
                タスク名:
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </label>

              <label>
                開始日:
                <input
                  type="date"
                  value={formData.start}
                  onChange={(e) =>
                    setFormData({ ...formData, start: e.target.value })
                  }
                  required
                />
              </label>

              <label>
                終了日:
                <input
                  type="date"
                  value={formData.end}
                  onChange={(e) =>
                    setFormData({ ...formData, end: e.target.value })
                  }
                  required
                />
              </label>

              <label>
                進捗 (%):
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.progress}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      progress: Number(e.target.value),
                    })
                  }
                />
              </label>

              <label>
                依存関係 (カンマ区切りID):
                <input
                  type="text"
                  placeholder="例: SCRIPT_PROJECT"
                  value={formData.dependencies}
                  onChange={(e) =>
                    setFormData({ ...formData, dependencies: e.target.value })
                  }
                />
              </label>

              <div className="modal-actions">
                <button type="submit" className="save-btn">
                  保存
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setIsModalOpen(false)}
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="copyright">
        ©️2026 Freelancer JOE. All Rights Reserved.
      </footer>
    </div>
  );
}

/* 指定した YYYY-MM-DD 文字列に指定日数（n日）を加算するヘルパー関数 */
function addDays(dateStr: string, days: number): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* Date | string → YYYY-MM-DD */
function formatDate(date: Date | string): string {
  if (!date) return "";
  if (typeof date === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    const d = new Date(date.replace(/-/g, "/"));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default App;