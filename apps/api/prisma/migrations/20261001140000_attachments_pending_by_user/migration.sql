-- CreateIndex
CREATE INDEX "attachments_user_id_message_id_idx" ON "attachments"("user_id", "message_id");
