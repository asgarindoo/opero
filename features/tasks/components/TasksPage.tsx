"use client";
import { useState, useMemo, useEffect } from "react";
import { Plus } from "lucide-react";
import { createTask as createTaskRecord, deleteTask as deleteTaskRecord, listTasks, updateTask as updateTaskRecord } from "@/features/tasks";
import type { Task, Status } from "@/features/tasks";
import ViewSwitcher, { type ViewType } from "@/features/tasks/views/ViewSwitcher";
import ListView from "@/features/tasks/views/ListView";
import KanbanView from "@/features/tasks/views/KanbanView";
import TableView from "@/features/tasks/views/TableView";
import CalendarView from "@/features/tasks/views/CalendarView";
import TimelineView from "@/features/tasks/views/TimelineView";
import TaskDrawer from "@/features/tasks/TaskDrawer";
import CreateTaskModal from "@/features/tasks/CreateTaskModal";
import { useTenant } from "@/components/providers/TenantProvider";
import { getUserDisplayName } from "@/lib/user-identity";
import { canUse } from "@/lib/client/rbac";

import ModuleHeader from "@/components/common/ModuleHeader";
import SearchInput from "@/components/common/SearchInput";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";

type GroupBy = "status" | "priority" | "assignee";
const GROUP_OPTIONS = [
  { value: "status",   label: "Status"   },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
];

export default function TasksPage() {
  const [tasks,        setTasks]        = useState<Task[]>([]);
  const [view,         setView]         = useState<ViewType>("list");
  const [search,       setSearch]       = useState("");
  const [groupBy,      setGroupBy]      = useState<GroupBy>("status");
  const [activeTask,   setActiveTask]   = useState<Task | null>(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [createStatus, setCreateStatus] = useState<Status | undefined>();
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    async function fetchTasks() {
      try {
        const data = await listTasks<Task>();
        setTasks(data);
      } catch (err) {
        console.error("Failed to load tasks:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTasks();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && tasks.length > 0) {
      const url = new URL(window.location.href);
      const taskId = url.searchParams.get("taskId");
      if (taskId) {
        const t = tasks.find(t => t.id === taskId);
        if (t) {
          setTimeout(() => setActiveTask(t), 0);
          url.searchParams.delete("taskId");
          window.history.replaceState({}, "", url.toString());
        }
      }
    }
  }, [tasks]);

  const { user, role } = useTenant();
  const canDeleteTasks = canUse(role, "tasks.delete");

  const nextId = `T-${String(tasks.length + 1).padStart(3, "0")}`;

  async function updateTask(id: string, patch: Partial<Task>) {
    const taskToUpdate = tasks.find(t => t.id === id);
    if (!taskToUpdate) return;
    
    const finalPatch = { ...patch };
    if (patch.status && patch.status !== taskToUpdate.status) {
      const actor = getUserDisplayName(user, "System");
      const timestamp = new Date().toLocaleString();
      const newActivity = {
        id: `a${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorId: user?.id,
        actor,
        action: `changed status to ${patch.status}`,
        timestamp
      };
      finalPatch.activity = [...taskToUpdate.activity, newActivity];
    }

    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...finalPatch } : t));
    setActiveTask(prev => prev?.id === id ? { ...prev, ...finalPatch } : prev);
    
    if (taskToUpdate.recordId) {
      try {
        await updateTaskRecord<Task>(taskToUpdate.recordId, finalPatch);
      } catch (err) {
        console.error("Failed to update task", err);
      }
    }
  }

  async function deleteTask(id: string) {
    if (!canDeleteTasks) return;

    const taskToDelete = tasks.find(t => t.id === id);
    setTasks(prev => prev.filter(t => t.id !== id));
    setActiveTask(null);

    if (taskToDelete?.recordId) {
      try {
        await deleteTaskRecord(taskToDelete.recordId);
      } catch (err) {
        console.error("Failed to delete task", err);
      }
    }
  }

  async function createTask(task: Task) {
    const optimisticTask = { ...task, id: task.id || `T-${Date.now()}` };
    setTasks(prev => [...prev, optimisticTask]);
    
    try {
      const saved = await createTaskRecord<Task>(task);
      setTasks(prev => prev.map(t => t.id === optimisticTask.id ? saved : t));
    } catch (err) {
      console.error("Failed to create task", err);
      setTasks(prev => prev.filter(t => t.id !== optimisticTask.id));
    }
  }

  function openCreate(status?: Status) {
    setCreateStatus(status);
    setShowCreate(true);
  }

  const filtered = useMemo(() => {
    if (!search) return tasks;
    const q = search.toLowerCase();
    return tasks.filter((t) =>
      (t.title ?? "").toLowerCase().includes(q) ||
      (t.id ?? "").toLowerCase().includes(q) ||
      (t.labels ?? []).some((l) => l.toLowerCase().includes(q)) ||
      (t.assignees ?? []).some((a) => a.name.toLowerCase().includes(q))
    );
  }, [tasks, search]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#fef8f8]">

      <ModuleHeader 
        title="Tasks"
        count={tasks.length}
        rightContent={(
          <>
            <SearchInput 
              value={search} 
              onChange={setSearch} 
              placeholder="Search tasks, labels..." 
              width={200}
            />
            
            {view === "list" && (
              <div className="w-[110px]">
                <Dropdown 
                  label="Group"
                  value={groupBy}
                  options={GROUP_OPTIONS}
                  onChange={(v) => setGroupBy(v as GroupBy)}
                  size="sm"
                />
              </div>
            )}

            <ViewSwitcher active={view} onChange={setView} />

            <Button 
              variant="primary" 
              size="sm" 
              icon={Plus}
              onClick={() => openCreate()}
            >
              NEW TASK
            </Button>
          </>
        )}
      />

      <div className="flex-1 flex flex-col overflow-hidden bg-transparent relative">

        {view === "list" && (
          <ListView tasks={filtered} groupBy={groupBy} onTaskClick={setActiveTask} onAddTask={openCreate} search={search} loading={loading} />
        )}
        {view === "kanban" && (
          <KanbanView tasks={filtered} onTaskClick={setActiveTask} onAddTask={openCreate} onStatusChange={(id, status) => updateTask(id, { status })} />
        )}
        {view === "table" && (
          <TableView tasks={filtered} onTaskClick={setActiveTask} onStatusChange={(id, status) => updateTask(id, { status })} />
        )}
        {view === "calendar" && (
          <CalendarView tasks={filtered} onTaskClick={setActiveTask} />
        )}
        {view === "timeline" && (
          <TimelineView tasks={filtered} onTaskClick={setActiveTask} />
        )}
      </div>

      {activeTask && (
        <TaskDrawer
          task={activeTask}
          allTasks={tasks}
          onClose={() => setActiveTask(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
          canDelete={canDeleteTasks}
        />
      )}

      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onCreate={createTask}
          nextId={nextId}
          defaultStatus={createStatus}
        />
      )}
    </div>
  );
}

