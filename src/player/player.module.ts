import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [PassportModule.register({ session: false })],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
