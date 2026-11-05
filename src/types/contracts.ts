export interface StakeInfo {
  status: StakeStatus;
  startTs: bigint;
  deferralTs: bigint;
  endTs: bigint;
  term: bigint;
  fenix: bigint;
  shares: bigint;
  payout: bigint;
}

export enum StakeStatus {
  Active = 0,
  Deferred = 1,
  EndedOnTime = 2,
  EndedEarly = 3,
  EndedLate = 4,
}
