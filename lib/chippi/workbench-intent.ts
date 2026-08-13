/** Only a direct open/edit request may override the normal chat/Modal route. */
export function isExplicitWorkbenchIntent(message: string): boolean {
  return /\b(open|edit)\b[^\n]{0,80}\b(workbench|spreadsheet|csv|xlsx|excel)\b/i.test(message);
}

/** Narrow follow-up language that is useful only with an already server-
 * resolved active workbook. It deliberately does not make generic “clean up”
 * requests mutate CRM data or force the Workbench lane by themselves. */
export function isWorkbookTransformIntent(message: string): boolean {
  return /\b(normaliz(?:e|ing|ation)|deduplicat(?:e|ing|ion)|remove\s+duplicate\s+rows?|trim(?:ming)?\s+whitespace|rename\s+(?:a\s+)?column|add\s+(?:a\s+)?(?:[a-z][\w -]{0,48}\s+)?column|tag\s+(?:every\s+)?(?:row|sheet)|clean\s+up\s+(?:this|the)\s+(?:workbook|spreadsheet|csv)|(?:email|phone)\s+(?:column|columns|numbers?)\b)/i.test(message);
}
