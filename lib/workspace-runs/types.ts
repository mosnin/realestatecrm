export type WorkspaceRunStatus = 'queued' | 'launching' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface WorkspaceRunEvent { id: string; sequence: number; type: 'workspace_started' | 'command_started' | 'command_finished' | 'file_created' | 'completed' | 'failed' | 'cancelled'; message: string; command: string | null; output: string | null; createdAt: string; }
export interface WorkspaceRunFile { id: string; name: string; mimeType: string; sizeBytes: number; fileId: string | null; createdAt: string; }
export type WorkspaceRunTaskStatus = 'queued' | 'launching' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface WorkspaceRunTaskPlanStep { command: string; description: string; }
export interface WorkspaceRunTaskEvent { id: string; sequence: number; type: 'workspace_started' | 'command_started' | 'command_finished' | 'file_created' | 'completed' | 'failed' | 'cancelled'; message: string; command: string | null; output: string | null; createdAt: string; }
export interface WorkspaceRunTaskFile extends WorkspaceRunFile {}
export interface WorkspaceRunTaskView { id: string; sequence: number; instruction: string; commandPlan: WorkspaceRunTaskPlanStep[]; status: WorkspaceRunTaskStatus; output: string | null; error: string | null; cancellationRequestedAt: string | null; events: WorkspaceRunTaskEvent[]; files: WorkspaceRunTaskFile[]; createdAt: string; }
export interface WorkspaceRunView { id: string; workSessionId: string; status: WorkspaceRunStatus; goal: string; error: string | null; cancellationRequestedAt: string | null; events: WorkspaceRunEvent[]; files: WorkspaceRunFile[]; tasks: WorkspaceRunTaskView[]; }
