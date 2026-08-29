import {
  Settlement,
  Survivor,
  Building,
  Resource,
  HistoryLog,
  Attributes,
  Needs,
  Profession,
  LoyaltyEvent,
  SocialLink,
  SettlementTier,
  Gender,
  TaskStatus,
  JobRole,
} from '@prisma/client';

export type RawSettlement = Settlement;
export type RawSurvivor = Survivor;
export type RawBuilding = Building;
export type RawResource = Resource;
export type RawHistoryLog = HistoryLog;
export type RawAttributes = Attributes;
export type RawNeeds = Needs;
export type RawProfession = Profession;
export type RawLoyaltyEvent = LoyaltyEvent;
export type RawSocialLink = SocialLink;

export interface DomainEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface SurvivorLoyaltyChangedPayload {
  settlementId: string;
  survivorId: string;
  loyalty: number;
  isLoyalAbsolute: boolean;
}

export interface ResourceExtractedPayload {
  settlementId: string;
  resourceType: string;
  quantity: string;
  buildingId?: string;
}

export interface SettlementSnapshot extends RawSettlement {}

export const SURVIVOR_EVENTS = {
  LOYALTY_CHANGED: 'SURVIVOR_LOYALTY_CHANGED',
} as const;

export const SETTLEMENT_EVENTS = {
  RESOURCE_EXTRACTED: 'RESOURCE_EXTRACTED',
  TICK_COMPLETED: 'SETTLEMENT_TICK_COMPLETED',
} as const;

export { SettlementTier, Gender, TaskStatus, JobRole };
