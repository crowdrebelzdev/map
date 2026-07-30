import type { EventMemberPermission } from "@/db/schema";

/** Named permission bundles for the team editor's preset picker — a starting point that
 * bulk-sets the checkboxes, not a locked role: the checkboxes stay individually editable
 * afterwards. An empty-permissions member already has baseline map access on its own (see
 * `lib/event-access.ts`), so "Viewer" is just that same behavior made explicit/discoverable
 * in the UI rather than a new access level. */
export const PERMISSION_PRESETS: { key: string; label: string; permissions: EventMemberPermission[] }[] = [
  { key: "viewer", label: "Alleen bekijken (viewer)", permissions: [] },
  { key: "security", label: "Beveiliging", permissions: ["view_live_locations", "manage_incidents"] },
  { key: "medical", label: "EHBO", permissions: ["view_live_locations", "manage_incidents"] },
  {
    key: "organizer",
    label: "Organisatie",
    permissions: ["edit_map", "manage_pois", "manage_categories", "view_live_locations", "manage_incidents"],
  },
];
