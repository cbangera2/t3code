// Enough hits to look past same-named neighbours (`ChatView.test.tsx`) without
// asking for a full listing on a single click.
export const WORKSPACE_BASENAME_LOOKUP_LIMIT = 25;

// Newest click wins within a thread. Other threads keep their own lookups.
const latestLookupSequenceByScope = new Map<string, number>();

/** Call the returned predicate when the search settles; false means a later click superseded it. */
export function claimWorkspaceBasenameLookup(scope: string): () => boolean {
  const next = (latestLookupSequenceByScope.get(scope) ?? 0) + 1;
  latestLookupSequenceByScope.set(scope, next);
  return () => latestLookupSequenceByScope.get(scope) === next;
}

export interface WorkspaceEntryCandidate {
  readonly path: string;
  readonly kind: "file" | "directory";
}

function posixPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function basenameOfPath(path: string): string {
  const posix = posixPath(path);
  const separatorIndex = posix.lastIndexOf("/");
  return separatorIndex >= 0 ? posix.slice(separatorIndex + 1) : posix;
}

export function normalizeWorkspaceLookupPath(relativePath: string): string {
  return relativePath
    .trim()
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/, "");
}

/** `a/b/c` matches `c` and `b/c` at a segment boundary, but not `abc`. */
function hasSegmentSuffix(path: string, suffix: string): boolean {
  const posix = posixPath(path);
  return posix === suffix || posix.endsWith(`/${suffix}`);
}

export function pickWorkspaceBasenameMatch(
  basename: string,
  entries: ReadonlyArray<WorkspaceEntryCandidate>,
): string | null {
  const target = normalizeWorkspaceLookupPath(basename);
  if (!target) return null;
  const files = entries.filter((entry) => entry.kind === "file");
  const exactPath = files.find((entry) => posixPath(entry.path) === target);
  if (exactPath) return exactPath.path;
  // Chip paths are relative to the agent's cwd, so match the suffix wherever it lives.
  const suffixMatches = files.filter((entry) => hasSegmentSuffix(entry.path, target));
  if (suffixMatches.length === 1) return suffixMatches[0]?.path ?? null;
  if (suffixMatches.length > 1) return null;
  const foldedTarget = target.toLowerCase();
  const foldedSuffixMatches = files.filter((entry) =>
    hasSegmentSuffix(posixPath(entry.path).toLowerCase(), foldedTarget),
  );
  if (foldedSuffixMatches.length === 1) return foldedSuffixMatches[0]?.path ?? null;
  if (foldedSuffixMatches.length > 1) return null;
  const exact = files.find((entry) => basenameOfPath(entry.path) === target);
  if (exact) return exact.path;
  // Folded matching covers casing that drifted from disk, but `FOO.ts` against
  // both `Foo.ts` and `foo.ts` has no right answer, so it resolves to nothing
  // rather than opening whichever the index ranked first.
  const foldedMatches = files.filter(
    (entry) => basenameOfPath(entry.path).toLowerCase() === foldedTarget,
  );
  return foldedMatches.length === 1 ? (foldedMatches[0]?.path ?? null) : null;
}
