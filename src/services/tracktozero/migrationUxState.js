export const MIGRATION_UX_STATES = Object.freeze({
  LOADING_SOURCE: "loading_source",
  PREVIEW_READY: "preview_ready",
  NEEDS_CONFIRMATION: "needs_confirmation",
  READY_TO_MIGRATE: "ready_to_migrate",
  MIGRATING: "migrating",
  MIGRATION_FAILED: "migration_failed",
  VALIDATION_FAILED: "validation_failed",
  MIGRATION_SUCCEEDED: "migration_succeeded",
  ROLLBACK_AVAILABLE: "rollback_available",
  ROLLBACK_BLOCKED: "rollback_blocked",
});

const safeMessage = (message, fallback) => {
  const value = String(message || fallback);
  if (/firebase|permission_denied|grpc|stack|trace/i.test(value)) return fallback;
  return value;
};

export const describeMigrationUxState = ({
  loading = false,
  preview = null,
  migrating = false,
  migrationResult = null,
  migrationError = null,
  validation = null,
  rollback = null,
} = {}) => {
  if (loading) {
    return {
      state: MIGRATION_UX_STATES.LOADING_SOURCE,
      title: "Scanning legacy data",
      message: "Previewing your migration will not change your existing TrackToZero data.",
      showSuccess: false,
      rollbackActionAvailable: false,
      world2Authoritative: false,
    };
  }
  if (migrating) {
    return {
      state: MIGRATION_UX_STATES.MIGRATING,
      title: "Migration in progress",
      message: "Creating a reviewed v2 copy in the emulator.",
      showSuccess: false,
      rollbackActionAvailable: false,
      world2Authoritative: false,
    };
  }
  if (rollback?.blocked) {
    return {
      state: MIGRATION_UX_STATES.ROLLBACK_BLOCKED,
      title: "Rollback blocked",
      message: "Rollback is blocked because v2-native or unrelated data exists.",
      showSuccess: false,
      rollbackActionAvailable: false,
      world2Authoritative: false,
    };
  }
  if (migrationError) {
    return {
      state: MIGRATION_UX_STATES.MIGRATION_FAILED,
      title: "Migration failed",
      message: safeMessage(migrationError.message, "Migration stopped safely. Review the issue and retry from the latest preview."),
      showSuccess: false,
      rollbackActionAvailable: false,
      world2Authoritative: false,
    };
  }
  if (validation && validation.ok === false) {
    return {
      state: MIGRATION_UX_STATES.VALIDATION_FAILED,
      title: "Validation failed",
      message: "The migrated copy did not match the reviewed preview. Do not continue to production cutover.",
      showSuccess: false,
      rollbackActionAvailable: false,
      world2Authoritative: false,
    };
  }
  if (migrationResult?.manifest?.rollbackEligible) {
    return {
      state: MIGRATION_UX_STATES.ROLLBACK_AVAILABLE,
      title: "Migration validated",
      message: "The reviewed v2 copy matches the preview. Rollback remains available before v2-native writes.",
      showSuccess: true,
      rollbackActionAvailable: true,
      world2Authoritative: false,
    };
  }
  if (migrationResult?.validation?.ok) {
    return {
      state: MIGRATION_UX_STATES.MIGRATION_SUCCEEDED,
      title: "Migration validated",
      message: "The reviewed v2 copy passed validation.",
      showSuccess: true,
      rollbackActionAvailable: false,
      world2Authoritative: false,
    };
  }
  if (preview?.ambiguousRecords?.length) {
    return {
      state: MIGRATION_UX_STATES.NEEDS_CONFIRMATION,
      title: "Some records need confirmation",
      message: `${preview.ambiguousRecords.length} records need your review before migration can continue.`,
      showSuccess: false,
      rollbackActionAvailable: false,
      world2Authoritative: false,
    };
  }
  if (preview) {
    return {
      state: preview.expectedTargetPaths?.length ? MIGRATION_UX_STATES.READY_TO_MIGRATE : MIGRATION_UX_STATES.PREVIEW_READY,
      title: "Migration preview ready",
      message: "Review debts, exclusions, members, balances, APR states, and draft plans before continuing.",
      showSuccess: false,
      rollbackActionAvailable: false,
      world2Authoritative: false,
    };
  }
  return {
    state: MIGRATION_UX_STATES.PREVIEW_READY,
    title: "Migration preview",
    message: "Start by scanning legacy data.",
    showSuccess: false,
    rollbackActionAvailable: false,
    world2Authoritative: false,
  };
};
