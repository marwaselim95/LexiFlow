import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersModel } from './users.model';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersModel],
  exports: [UsersService],
})
export class UsersModule {}
