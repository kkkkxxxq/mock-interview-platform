import { Hono } from "hono";
import { COMPANIES, TECH_REQUIREMENTS } from "@mock/data";
import { authMiddleware } from "../auth";

const catalog = new Hono();

catalog.use("*", authMiddleware);

catalog.get("/companies", (c) => c.json({ companies: COMPANIES }));
catalog.get("/tech-requirements", (c) => c.json({ techRequirements: TECH_REQUIREMENTS }));

export default catalog;