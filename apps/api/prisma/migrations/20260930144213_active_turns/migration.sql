-- CreateTable
CREATE TABLE "active_turns" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "active_turns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "active_turns_conversation_id_key" ON "active_turns"("conversation_id");

-- CreateIndex
CREATE INDEX "active_turns_user_id_idx" ON "active_turns"("user_id");

-- AddForeignKey
ALTER TABLE "active_turns" ADD CONSTRAINT "active_turns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_turns" ADD CONSTRAINT "active_turns_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
