import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max, IsIn } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsIn(['b_warehouse_minerals', 'b_warehouse_wood', 'b_warehouse_food'])
  buildingId!: 'b_warehouse_minerals' | 'b_warehouse_wood' | 'b_warehouse_food';

  @IsString()
  @IsIn(['mineral', 'madera', 'comida'])
  warehouseType!: 'mineral' | 'madera' | 'comida';

  @IsNumber()
  @Min(0)
  tileX!: number;

  @IsNumber()
  @Min(0)
  tileY!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(6)
  chapter?: number;
}

export class DepositWarehouseDto {
  @IsString()
  nombre!: string;

  @IsNumber()
  @Min(1)
  cantidad!: number;

  @IsOptional()
  @IsBoolean()
  fromPlayer?: boolean;

  @IsOptional()
  @IsString()
  npcId?: string;
}

export class WithdrawWarehouseDto {
  @IsNumber()
  @Min(0)
  @Max(99)
  slotIndex!: number;

  @IsNumber()
  @Min(1)
  cantidad!: number;

  @IsOptional()
  @IsBoolean()
  toPlayer?: boolean;

  @IsOptional()
  @IsString()
  npcId?: string;
}

export interface BackendWarehouseSlot {
  slotIndex: number;
  id: string;
  nombre: string;
  cantidad: number;
  categoria: 'mineral' | 'madera' | 'comida';
  icono?: string;
}

export interface BackendWarehouse {
  id: string;
  buildingId: 'b_warehouse_minerals' | 'b_warehouse_wood' | 'b_warehouse_food';
  warehouseType: 'mineral' | 'madera' | 'comida';
  name: string;
  tileX: number;
  tileY: number;
  width: number;
  height: number;
  level: number;
  slots: (BackendWarehouseSlot | null)[];
  createdAt: number;
}
