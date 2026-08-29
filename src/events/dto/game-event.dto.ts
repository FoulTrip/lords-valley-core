export interface SurvivorLoyaltyChangedDto {
  settlementId: string;
  survivorId: string;
  loyalty: number;
  isLoyalAbsolute: boolean;
}

export interface ResourceExtractedDto {
  settlementId: string;
  resourceType: string;
  quantity: string;
  buildingId?: string;
}

export interface SettlementTickDto {
  settlementId: string;
  gameTime: number;
  season: string;
}

export interface JoinSettlementDto {
  settlementId: string;
}
