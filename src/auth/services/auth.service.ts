import { BadRequestException, Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, username: string, password: string) {
    const exists = await this.prisma.player.findFirst({ where: { OR: [{ email }, { username }] } });
    if (exists) throw new ConflictException('Email o username ya existe');
    const hash = await bcrypt.hash(password, 10);
    const player = await this.prisma.player.create({ data: { email, username, passwordHash: hash, settings: {} } });
    const token = this.sign(player.id, player.email);
    return { player: { id: player.id, email: player.email, username: player.username }, access_token: token };
  }

  async login(email: string, password: string) {
    const player = await this.prisma.player.findUnique({ where: { email } });
    if (!player) throw new UnauthorizedException('Credenciales inválidas');
    const ok = await bcrypt.compare(password, player.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');
    const token = this.sign(player.id, player.email);
    return { player: { id: player.id, email: player.email, username: player.username }, access_token: token };
  }

  async findById(id: string) {
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) return null;
    const { passwordHash, ...safe } = player;
    return safe;
  }

  async updateSettings(id: string, settings: any) {
    const safe = { ...((settings as Record<string, unknown> | null) ?? {}) };
    delete safe.game;
    const player = await this.prisma.player.update({ where: { id }, data: { settings: safe as never } });
    const { passwordHash, ...rest } = player;
    return rest;
  }

  async updateLastPos(id: string, pos: { x: number; y: number }) {
    if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) {
      throw new BadRequestException('Posición inválida');
    }
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) throw new Error('Player not found');
    const currentSettings = (player.settings as any) || {};
    const newSettings = { ...currentSettings, lastPos: pos, lastSeen: new Date().toISOString() };
    // NO pasar por updateSettings: ese método hace `delete safe.game` por diseño
    // (Player.settings.game es de escritura exclusiva del servidor, módulo player).
    // El autoguardado de posición corre cada 5s: si borrara `game`, vaciaría el
    // inventario y resetearía hambre/sed en cada guardado. Aquí se conserva tal cual.
    const updated = await this.prisma.player.update({
      where: { id },
      data: { settings: newSettings as never },
    });
    const { passwordHash, ...rest } = updated;
    return rest;
  }

  private sign(sub: string, email: string): string {
    return this.jwt.sign({ sub, email });
  }
}
