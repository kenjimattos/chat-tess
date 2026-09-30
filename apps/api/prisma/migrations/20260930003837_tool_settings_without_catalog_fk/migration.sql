-- AlterEnum
ALTER TYPE "ToolSource" ADD VALUE 'MCP';

-- DropForeignKey
ALTER TABLE "user_tool_settings" DROP CONSTRAINT "user_tool_settings_tool_name_fkey";
