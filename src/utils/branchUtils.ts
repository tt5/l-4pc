/**
 * Generate a unique branch name for chess move variations
 * @param moveNumber - The move number where the branch starts
 * @param parentBranch - Optional parent branch path for nested branches
 * @returns A unique branch name string
 */
export const generateBranchName = (moveNumber: number, parentBranch: string | null = null): string => {
  const timestamp = Date.now().toString(36).slice(-4);
  const branchSuffix = `branch-${moveNumber}-${timestamp}`;
  return parentBranch ? `${parentBranch.split('/').slice(-1)}/${branchSuffix}` : branchSuffix;
};

/**
 * Build a full branch path from a branch path string
 * @param branchPath - The branch path string
 * @param fullMoveHistory - Full move history for nested branch resolution
 * @returns The full branch path
 */
export const buildFullBranchName = (
  branchPath: string, 
  fullMoveHistory?: any[]
): string => {

  const branchPathFull = branchPath?.split('/') || [];
  const branchPathShort = branchPathFull.slice(-2);
  let reconstructedBranchName = branchPathShort[1];
  let count = 10;
  let newBranchPathShort = [branchPathShort[0], 'main'];
  let newCurrentHistoryParent = [];
  
  while (true) {
    reconstructedBranchName = newBranchPathShort[0] + '/' + reconstructedBranchName;
    if (newBranchPathShort[0] === 'main') {
      break;
    }

    if (fullMoveHistory) {
      newCurrentHistoryParent = fullMoveHistory.filter(m => m.branchName?.endsWith(newBranchPathShort[0]));
      if (newCurrentHistoryParent[0]) {
        newBranchPathShort = newCurrentHistoryParent[0].branchName?.split('/') || [];
      }
    }

    count = count - 1;
    if (count === 0) break;
  }
  
  if (reconstructedBranchName === 'main/undefined') {
    reconstructedBranchName = 'main';
  }

  return reconstructedBranchName;
};
