import { reviewRead } from "../../../../src/server/review/http";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => reviewRead(request);
