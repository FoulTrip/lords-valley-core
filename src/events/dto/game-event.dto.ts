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

export interface NpcConversationRequestDto {
  settlementId: string;
  initiatorId: string;
  initiatorName?: string;
  initiatorJob?: string;
  targetId: string;
  targetName?: string;
  targetJob?: string;
}

export interface SurvivorConversationEventDto {
  settlementId: string;
  dialogueId: string;
  initiatorId: string;
  initiatorName: string;
  initiatorText: string;
  targetId: string;
  targetName: string;
  responderText: string;
  topic: string;
  replyDelayMs: number;
  durationMs: number;
}
