import { createPostalCodesRoute } from "packlink-nextjs/next";

import { packlink } from "@/lib/packlink";

export const dynamic = "force-dynamic";

// GET ?country=IT&zip=03100 → { valid, postalCodes }   (validate, fill in the city)
// GET ?country=IT&q=frosi   → { postalCodes }          (autocomplete)
export const { GET } = createPostalCodesRoute({ client: packlink });
