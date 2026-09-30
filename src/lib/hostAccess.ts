export interface SceneRoster {
  members: { did: string; role: string }[];
  steward: boolean;
}

export function canHostScene(viewerDid: string | null, roster: SceneRoster | undefined): boolean {
  if (!viewerDid || !roster) return false;
  return roster.steward === true || roster.members.some(
    (member) => member.did === viewerDid && ["builder", "facilitator", "steward"].includes(member.role),
  );
}
