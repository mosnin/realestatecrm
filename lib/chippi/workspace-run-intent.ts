/** Narrow request signal for continuing the completed private Workspace. */
const WORKSPACE_CONTINUATION_INTENT = /\b(?:continue|resume|follow[ -]?up|build on|extend|keep working)\b[\s\S]{0,100}\b(?:workspace|analysis|report|it|that)\b|\bworkspace\b[\s\S]{0,100}\b(?:continue|resume|follow[ -]?up|extend)\b/i;

export function isWorkspaceRunContinuationIntent(message: string): boolean {
  return WORKSPACE_CONTINUATION_INTENT.test(message ?? '');
}
