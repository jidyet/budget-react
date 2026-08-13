import { describe, it } from "vitest";
import { InMemoryTrackToZeroRepository } from "./tracktozeroRepositories";
import { activatePlanTransaction } from "../tracktozero/activePlanService";
import { runTrackToZeroRepositoryContractSuite } from "../../../tests/support/trackToZeroRepositoryContract.js";

runTrackToZeroRepositoryContractSuite({
  describe,
  it,
  createRepository: () => new InMemoryTrackToZeroRepository(),
  switchActivePlan: (repo, args) => activatePlanTransaction({ repository: repo, ...args }),
});
