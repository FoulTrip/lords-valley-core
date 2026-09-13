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

export interface ViewportDto {
  minChunkX: number;
  minChunkY: number;
  maxChunkX: number;
  maxChunkY: number;
}

export interface JoinSettlementDto {
  settlementId: string;
}
