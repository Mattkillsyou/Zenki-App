import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmployeeTask, TaskCompletion } from '../types/employeeTask';
import { generateId } from '../utils/generateId';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';
import { todayDateString as todayISO } from '../utils/dates';
import {
  subscribeToTasks,
  subscribeToCompletions,
  upsertTaskInFirestore,
  deleteTaskFromFirestore,
  upsertCompletionInFirestore,
  deleteCompletionFromFirestore,
} from '../services/employeeTaskSync';
import { syncOrAlert } from '../utils/syncOrAlert';

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


function genId(): string {
  return generateId('task');
}

export function EmployeeTaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [loaded, setLoaded] = useState(false);

  // AsyncStorage cache hydrate. Firestore subscription overwrites once it
  // fires; this just covers the offline cold-boot window.
  useEffect(() => {
    (async () => {
      try {
        const [tRaw, cRaw] = await Promise.all([
          AsyncStorage.getItem(TASKS_KEY),
          AsyncStorage.getItem(COMPLETIONS_KEY),
        ]);
        const cachedTasks = safeParseJSON<EmployeeTask[]>(tRaw, [], Array.isArray);
        const cachedCompletions = safeParseJSON<TaskCompletion[]>(cRaw, [], Array.isArray);
        if (cachedTasks.length > 0) setTasks(cachedTasks);
        if (cachedCompletions.length > 0) setCompletions(cachedCompletions);
      } catch (err) {
        console.warn('[EmployeeTasks] cold-boot hydrate failed:', err);
      }
      setLoaded(true);
    })();
  }, []);

  // Live Firestore subscriptions for both collections.
  useEffect(() => {
    const unsubTasks = subscribeToTasks((items) => {
      setTasks(items);
      safeStorageSet(TASKS_KEY, items, '[EmployeeTasks tasks]');
    });
    const unsubCompletions = subscribeToCompletions((items) => {
      setCompletions(items);
      safeStorageSet(COMPLETIONS_KEY, items, '[EmployeeTasks completions]');
    });
    return () => {
      unsubTasks();
      unsubCompletions();
    };
  }, []);

  useEffect(() => {
    if (loaded) safeStorageSet(TASKS_KEY, tasks, '[EmployeeTasks tasks]');
  }, [tasks, loaded]);

  useEffect(() => {
    if (loaded) safeStorageSet(COMPLETIONS_KEY, completions, '[EmployeeTasks completions]');
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
        syncOrAlert(deleteCompletionFromFirestore({ taskId, memberId, date: today }), 'Task completion delete');
        return prev.filter((c) => c !== existing);
      }
      const created: TaskCompletion = {
        taskId,
        memberId,
        date: today,
        completedAt: new Date().toISOString(),
      };
      syncOrAlert(upsertCompletionInFirestore(created), 'Task completion');
      return [...prev, created];
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
      syncOrAlert(upsertTaskInFirestore(task), 'Task');
      return task;
    },
    [],
  );

  const removePersonalTask = useCallback((id: string) => {
    setTasks((prev) => {
      const target = prev.find((t) => t.id === id && t.source === 'personal');
      if (target) syncOrAlert(deleteTaskFromFirestore(id), 'Task delete');
      return prev.filter((t) => !(t.id === id && t.source === 'personal'));
    });
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
    syncOrAlert(upsertTaskInFirestore(task), 'Task');
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
      syncOrAlert(upsertTaskInFirestore(task), 'Task');
      return task;
    },
    [],
  );

  const updateTask = useCallback((id: string, patch: Partial<EmployeeTask>) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      const merged = next.find((t) => t.id === id);
      if (merged) syncOrAlert(upsertTaskInFirestore(merged), 'Task');
      return next;
    });
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setCompletions((prev) => {
      const stale = prev.filter((c) => c.taskId === id);
      stale.forEach((c) => {
        syncOrAlert(deleteCompletionFromFirestore({ taskId: c.taskId, memberId: c.memberId, date: c.date }), 'Task completion delete');
      });
      return prev.filter((c) => c.taskId !== id);
    });
    syncOrAlert(deleteTaskFromFirestore(id), 'Task delete');
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
