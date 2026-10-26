// Issue collection and the two output shapes: the JSON object and the readable report.
//
// JSON: { ok, target, counts: { error, warning, info }, issues: [{ code, severity, path, line?, message, remediation, docs? }] }
// Codes are stable UPPER_SNAKE identifiers; `ok` is true when nothing at or above the fail level was found.

const ORDER = { error: 0, warning: 1, info: 2 };
const CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

export const SEVERITIES = Object.keys(ORDER);

export function createReport(target) {
  const issues = [];
  const add = (severity, code, path, message, remediation, extra = {}) => {
    if (!CODE.test(code)) throw new Error(`issue code is not UPPER_SNAKE: ${code}`);
    const issue = { code, severity, path: String(path ?? '.').split('\\').join('/'), message, remediation };
    if (Number.isInteger(extra.line)) issue.line = extra.line;
    if (extra.docs) issue.docs = extra.docs;
    issues.push(issue);
    return issue;
  };
  return {
    error: (code, path, message, remediation, extra) => add('error', code, path, message, remediation, extra),
    warning: (code, path, message, remediation, extra) => add('warning', code, path, message, remediation, extra),
    info: (code, path, message, remediation, extra) => add('info', code, path, message, remediation, extra),
    has: (code) => issues.some((i) => i.code === code),
    finish(failLevel = 'error') {
      const sorted = [...issues].sort(
        (a, b) => ORDER[a.severity] - ORDER[b.severity] || a.code.localeCompare(b.code) || a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0),
      );
      const counts = { error: 0, warning: 0, info: 0 };
      for (const i of sorted) counts[i.severity] += 1;
      return { ok: !fails({ counts }, failLevel), target, counts, issues: sorted };
    },
  };
}

/** Does this report fail at the given level? ('error' by default; 'warning' makes warnings fail too.) */
export function fails(report, failLevel = 'error') {
  const { counts } = report;
  return failLevel === 'warning' ? counts.error + counts.warning > 0 : counts.error > 0;
}

export function formatText(report) {
  const { target, counts, issues } = report;
  const lines = [`beyondplay-check ${target.kind} ${target.dir}`];
  if (target.template) lines.push(`template: ${target.template}`);
  for (const severity of SEVERITIES) {
    const group = issues.filter((i) => i.severity === severity);
    if (!group.length) continue;
    lines.push('', `${severity.toUpperCase()}S (${group.length})`.replace('INFOS', 'INFO'));
    for (const i of group) {
      lines.push(`  ${i.code}  ${i.path}${i.line ? `:${i.line}` : ''}`);
      lines.push(`      ${i.message}`);
      if (i.remediation) lines.push(`      Fix: ${i.remediation}`);
      if (i.docs) lines.push(`      Docs: ${i.docs}`);
    }
  }
  const summary = `${counts.error} error${counts.error === 1 ? '' : 's'}, ${counts.warning} warning${counts.warning === 1 ? '' : 's'}, ${counts.info} info`;
  lines.push('', `${report.ok ? 'PASS' : 'FAIL'}: ${summary}`);
  return lines.join('\n') + '\n';
}
