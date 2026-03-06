ALTER TABLE "contaktly_conversation" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "contaktly_workspace_config" ADD COLUMN "organization_id" text;--> statement-breakpoint
CREATE INDEX "contaktly_conversation_organizationId_idx" ON "contaktly_conversation" ("organization_id");--> statement-breakpoint
CREATE INDEX "contaktly_workspace_config_organizationId_idx" ON "contaktly_workspace_config" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contaktly_workspace_config_organizationId_unique" ON "contaktly_workspace_config" ("organization_id");--> statement-breakpoint
ALTER TABLE "contaktly_conversation" ADD CONSTRAINT "contaktly_conversation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "contaktly_workspace_config" ADD CONSTRAINT "contaktly_workspace_config_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;