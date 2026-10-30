import { createDropoffsRoute } from "packlink-nextjs/next";

import { packlink } from "@/lib/packlink";

export const dynamic = "force-dynamic";

// GET ?serviceId=123&zip=03100&country=IT → { points }
export const { GET } = createDropoffsRoute({ client: packlink });
