import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../http/public.decorator.js";
import { PublicHomeService } from "./public-home.service.js";

/** ADR 0016: what the public home shows, without access and read only. */
@ApiTags("public")
@Controller("public")
export class PublicHomeController {
  constructor(@Inject(PublicHomeService) private readonly home: PublicHomeService) {}

  @Get("home")
  @Public()
  @ApiOkResponse({ description: "Fees, and the live data when switched on and enough" })
  read() {
    return this.home.home();
  }
}
