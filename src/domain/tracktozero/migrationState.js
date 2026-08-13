import { MIGRATION_STATES } from "./constants";
import { requireEnum } from "./validation";

export const describeMigrationState = (state) => {
  requireEnum(state, MIGRATION_STATES, "migration.state");
  return {
    legacy: "1.0 records are canonical; v2 can read through adapters only.",
    eligible: "Workspace appears safe to preview but is not converted.",
    migration_preview: "Read-only candidate v2 shape has been generated; no writes.",
    migrated: "Future state: v2 entities created after confirmation.",
    rollback_allowed: "Future state: v2 writes exist but rollback/export remains supported.",
    v2_native: "Future state: v2 is canonical and legacy is archived/read-only.",
  }[state];
};

