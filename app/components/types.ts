export type Viewer = {
  id: string;
  username: string;
  displayName?: string;
};

export type Killer = {
  id: number;
  name: string;
};

export type RedemptionPayload = {
  note?: string;
  survivor?: string;
  perks?: string[];
};

export type ViewerRedemption = {
  id: number;
  reward_type: "join_game" | "build_request";
  cost: number;
  status: "pending" | "approved" | "rejected" | "fulfilled";
  payload: RedemptionPayload | null;
  created_at: string;
  refunded?: boolean;
};