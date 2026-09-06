export default {
  "test": {
    "environment": "node",
    "include": [
      "src/__tests__/integration/convergence-status.test.ts",
      "src/__tests__/integration/ingest-commit-race.test.ts",
      "src/__tests__/integration/rewind-persistence.test.ts",
      "src/core/__tests__/account-identity-proof.test.ts"
    ],
    "passWithNoTests": false,
    "allowOnly": false,
    "fileParallelism": false,
    "maxWorkers": 1
  }
};
