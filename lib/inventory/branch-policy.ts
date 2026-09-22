import "server-only";
import type { PoolClient } from "@neondatabase/serverless";

export const CONTROLLED_BRANCH_NAMES=["Treviño","Plaza del Audio"] as const;

export async function assertControlledBranch(client:PoolClient,branchId:string){
  const q=await client.query(
    "SELECT 1 FROM branches WHERE id=$1::uuid AND status='ACTIVE' AND name=ANY($2::text[])",
    [branchId,[...CONTROLLED_BRANCH_NAMES]],
  );
  if(!q.rowCount)throw new Error("BRANCH_ONLY_FOR_TRANSFERS");
}
