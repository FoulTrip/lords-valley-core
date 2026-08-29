import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
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
    const player = await this.prisma.player.update({ where: { id }, data: { settings } });
    const { passwordHash, ...safe } = player;
    return safe;
  }

  async updateLastPos(id: string, pos: { x: number; y: number }) {
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) throw new Error('Player not found');
    const currentSettings = (player.settings as any) || {};
    const newSettings = { ...currentSettings, lastPos: pos, lastSeen: new Date().toISOString() };
    return this.updateSettings(id, newSettings);
  }

  private sign(sub: string, email: string): string {
    return this.jwt.sign({ sub, email });
  }
}
