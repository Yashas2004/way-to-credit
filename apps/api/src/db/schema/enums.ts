import { pgEnum } from "drizzle-orm/pg-core";

export const queryStatusEnum = pgEnum("query_status", ["pending", "approved", "rejected"]);

export const actorTypeEnum = pgEnum("actor_type", ["admin", "user"]);

export const activityEventEnum = pgEnum("activity_event", ["login", "logout", "forced_logout"]);
