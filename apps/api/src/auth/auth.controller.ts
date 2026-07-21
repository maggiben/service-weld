import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthService } from "./auth.service";
import {
  LoginRequestDto,
  LoginResponseDto,
  LogoutRequestDto,
  MeResponseDto,
  RefreshRequestDto,
} from "./dto/auth.dto";
import { JwtRefreshAuthGuard, LocalAuthGuard } from "./guards/auth.guards";
import { UseGuards } from "@nestjs/common";
import type { AuthPrincipal } from "./principal";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post("login")
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: "INVALID_CREDENTIALS" })
  async login(
    @Body() _body: LoginRequestDto,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
    return this.authService.login(user, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
  }

  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @Post("refresh")
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: "INVALID_REFRESH" })
  async refresh(
    @Body() body: RefreshRequestDto,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
    return this.authService.refresh(user, body.refresh_token, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
  }

  @Post("logout")
  @HttpCode(204)
  @ApiBearerAuth()
  async logout(@Body() body: LogoutRequestDto): Promise<void> {
    await this.authService.logout(body.refresh_token);
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentUser() user: AuthPrincipal): Promise<MeResponseDto> {
    return this.authService.me(user);
  }
}
