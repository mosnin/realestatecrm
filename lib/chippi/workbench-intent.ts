/** Only a direct open/edit request may override the normal chat/Modal route. */
export function isExplicitWorkbenchIntent(message: string): boolean {
  return /\b(open|edit)\b[^\n]{0,80}\b(workbench|spreadsheet|csv|xlsx|excel)\b/i.test(message);
}
