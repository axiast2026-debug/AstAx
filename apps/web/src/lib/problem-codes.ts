/**
 * The errors of an API problem as form codes («path:ISSUE», comma separated):
 * field paths and issue codes, never the values typed (CLAUDE.md rule 8).
 */
interface Problem {
  code?: string;
  errors?: { path: string; issue: string }[];
}

export function problemCodes(body: unknown): string {
  const problem = (body ?? {}) as Problem;
  const codes = problem.errors?.length
    ? problem.errors.map((e) =>
        e.path && !e.issue.includes(":") ? `${e.path}:${e.issue}` : e.issue,
      )
    : [problem.code ?? "INTERNAL"];
  return [...new Set(codes)].slice(0, 10).join(",");
}
