import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmployeeTask, TaskCompletion } from '../types/employeeTask';
import { generateId } from '../utils/generateId';

const TASKS_KEY = '@zenki_employee_tasks';
const COMPLETIONS_KEY = '@zenki_task_completions';

interface TaskForToday extends EmployeeTask {
  completedToday: boolean;
}

interface EmployeeTaskContextValue {
  tasks: EmployeeTask[];
  completions: TaskCompletion[];

  // Queries (employee-facing)
  todayTasksFor: (memberId: string) => TaskForToday[];

  // Employee actions
  toggleComplete: (taskId: string, memberId: string) => void;
  addPersonalTask: (memberId: string, title: string, description?: string) => EmployeeTask;
  removePersonalTask: (id: string) => void;

  // Admin actions
  addDefaultTask: (title: string, description?: string) => EmployeeTask;
  addAssignedTask: (title: string, dueDate: string, assignedToMemberId?: string, description?: string) => EmployeeTask;
  updateTask: (id: string, patch: Partial<EmployeeTask>) => void;
  removeTask: (id: string) => void;
}

const EmployeeTaskContext = createContext<EmployeeTaskContextValue>({
  tasks: [],
  completions: [],
  todayTasksFor: () => [],
  toggleComplete: () => {},
  addPersonalTask: () => ({} as EmployeeTask),
  removePersonalTask: () => {},
  addDefaultTask: () => ({} as EmployeeTask),
  addAssignedTask: () => ({} as EmployeeTask),
  updateTask: () => {},
  removeTask: () => {},
});

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function genId(): string {
  return generateId('task');
}

const DEFAULT_SEED_TASKS: Omit<EmployeeTask, 'id' | 'createdAt'>[] = [
  { title: 'Unlock & open the dojo', source: 'default' },
  { title: 'Wipe mats with disinfectant', source: 'default' },
  { title: 'Stock water & towel station', source: 'default' },
  { title: 'Check bathrooms & restock', source: 'default' },
  { title: 'Close out register & lock up', source: 'default' },
];

export function EmployeeTaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [tRaw, cRaw] = await Promise.all([
          AsyncStorage.getItem(TASKS_KEY),
          AsyncStorage.getItem(COMPLETIONS_KEY),
        ]);
        if (tRaw) {
          const existing: EmployeeTask[] = JSON.parse(tRaw);
          setTasks(existing);
        } else {
          // Seed default daily tasks on first run
          const seeded: EmployeeTask[] = DEFAULT_SEED_TASKS.map((t) => ({
            ...t,
            id: genId(),
            createdAt: new Date().toISOString(),
          }));
          setTasks(seeded);
        }
        if (cRaw) setCompletions(JSON.parse(cRaw));
      } catch { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  }, [tasks, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(COMPLETIONS_KEY, JSON.stringify(completions));
  }, [completions, loaded]);

  // ── Queries ─────────────────────────────────────────

  const todayTasksFor = useCallback(
    (memberId: string): TaskForToday[] => {
      const today = todayISO();
      const relevant = tasks.filter((t) => {
        if (t.source === 'default') return true;
        if (t.source === 'assigned') {
          if (t.dueDate !== today) return false;
          if (t.assignedToMemberId && t.assignedToMemberId !== memberId) return false;
          return true;
        }
        if (t.source === 'personal') return t.ownerMemberId === memberId;
        return false;
      });
      return relevant.map((t) => ({
        ...t,
        completedToday: completions.some(
          (c) => c.taskId === t.id && c.memberId === memberId && c.date === today,
        ),
      }));
    },
    [tasks, completions],
  );

  // ── Employee actions ────────────────────────────────

  const toggleComplete = useCallback((taskId: string, memberId: string) => {
    const today = todayISO();
    setCompletions((prev) => {
      const existing = prev.find(
        (c) => c.taskId === taskId && c.memberId === memberId && c.date === today,
      );
      if (existing) {
        return prev.filter((c) => c !== existing);
      }
      return [
        ...prev,
        { taskId, memberId, date: today, completedAt: new Date().toISOString() },
      ];
    });
  }, []);

  const addPersonalTask = useCallback(
    (memberId: string, title: string, description?: string): EmployeeTask => {
      const task: EmployeeTask = {
        id: genId(),
        title,
        description,
        source: 'personal',
        ownerMemberId: memberId,
        createdAt: new Date().toISOString(),
      };
      setTasks((prev) => [task, ...prev]);
      return task;
    },
    [],
  );

  const removePersonalTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => !(t.id === id && t.source === 'personal')));
  }, []);

  // ── Admin actions ───────────────────────────────────

  const addDefaultTask = useCallback((title: string, description?: string): EmployeeTask => {
    const task: EmployeeTask = {
      id: genId(),
      title,
      description,
      source: 'default',
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [task, ...prev]);
    return task;
  }, []);

  const addAssignedTask = useCallback(
    (title: string, dueDate: string, assignedToMemberId?: string, description?: string): EmployeeTask => {
      const task: EmployeeTask = {
        id: genId(),
        title,
        description,
        source: 'assigned',
        dueDate,
        assignedToMemberId,
        createdAt: new Date().toISOString(),
      };
      setTasks((prev) => [task, ...prev]);
      return task;
    },
    [],
  );

  const updateTask = useCallback((id: string, patch: Partial<EmployeeTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    // Also drop any completions for it
    setCompletions((prev) => prev.filter((c) => c.taskId !== id));
  }, []);

  const value = useMemo(
    () => ({
      tasks,
      completions,
      todayTasksFor,
      toggleComplete,
      addPersonalTask,
      removePersonalTask,
      addDefaultTask,
      addAssignedTask,
      updateTask,
      removeTask,
    }),
    [tasks, completions, todayTasksFor, toggleComplete, addPersonalTask, removePersonalTask, addDefaultTask, addAssignedTask, updateTask, removeTask],
  );

  return <EmployeeTaskContext.Provider value={value}>{children}</EmployeeTaskContext.Provider>;
}

export function useEmployeeTasks() {
  return useContext(EmployeeTaskContext);
}
