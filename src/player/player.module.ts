import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CombatModule } from '../combat/combat.module';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [PassportModule.register({ session: false }), CombatModule],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
