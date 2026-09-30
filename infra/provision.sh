#!/usr/bin/env bash
#
# Provisiona a infraestrutura do chat-tess no Google Cloud e faz o primeiro deploy.
#
# ATENÇÃO: cria recursos que geram custo (Cloud SQL é cobrado por hora).
# Leia o script antes de executar. Ele pode ser executado mais de uma vez:
# recursos que já existem são mantidos.
#
# Uso:
#   ./infra/provision.sh                         # usa o projeto ativo no gcloud
#   PROJECT_ID=meu-projeto ./infra/provision.sh
#
# Pré-requisitos: gcloud autenticado, faturamento ativo no projeto e as variáveis
# GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET definidas no ambiente ou no
# .env da raiz. ALLOWED_EMAILS e ADMIN_EMAILS (opcionais) são lidos da mesma forma.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
: "${PROJECT_ID:?Defina PROJECT_ID ou selecione um projeto com gcloud config set project}"
REGION="${REGION:-southamerica-east1}"
SERVICE="${SERVICE:-chat-tess}"
SQL_INSTANCE="${SQL_INSTANCE:-chat-tess-db}"
SQL_TIER="${SQL_TIER:-db-f1-micro}"
DATABASE_NAME="chat_tess"
DATABASE_USER="chat_tess"
BUCKET="${BUCKET:-${PROJECT_ID}-chat-tess-files}"
SERVICE_ACCOUNT="${SERVICE}-run"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
DATABASE_URL_SECRET="${SERVICE}-database-url"
SESSION_SECRET_NAME="${SERVICE}-session-secret"
OAUTH_SECRET_NAME="${SERVICE}-google-oauth-client-secret"
ENV_FILE="$(dirname "$0")/../.env"

gcloud_project() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
step() { printf '\n==> %s\n' "$1"; }
exists() { "$@" >/dev/null 2>&1; }

# Lê uma variável do ambiente ou, se ausente, do .env. Só as chaves pedidas são
# lidas: o restante do .env descreve o ambiente local e não vale para produção.
read_setting() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    printf '%s' "${!name}"
  elif [[ -f "$ENV_FILE" ]]; then
    grep -E "^${name}=" "$ENV_FILE" | tail -1 | cut -d= -f2-
  fi
}

create_secret_if_missing() {
  local name="$1" value="$2"
  if ! exists gcloud_project secrets describe "$name"; then
    printf '%s' "$value" |
      gcloud_project secrets create "$name" --data-file=- --replication-policy automatic
  fi
}

GOOGLE_OAUTH_CLIENT_ID="$(read_setting GOOGLE_OAUTH_CLIENT_ID)"
GOOGLE_OAUTH_CLIENT_SECRET="$(read_setting GOOGLE_OAUTH_CLIENT_SECRET)"
ALLOWED_EMAILS="$(read_setting ALLOWED_EMAILS)"
ADMIN_EMAILS="$(read_setting ADMIN_EMAILS)"
: "${GOOGLE_OAUTH_CLIENT_ID:?Defina GOOGLE_OAUTH_CLIENT_ID no ambiente ou no .env}"
: "${GOOGLE_OAUTH_CLIENT_SECRET:?Defina GOOGLE_OAUTH_CLIENT_SECRET no ambiente ou no .env}"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
# URL determinística do Cloud Run; conhecida antes do primeiro deploy.
SERVICE_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"

step "Habilitando as APIs"
gcloud_project services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com

step "Permissão de build para deploy a partir do código-fonte"
# Em projetos novos, o Cloud Build usa a conta padrão do Compute Engine, que
# não tem mais as permissões de build por padrão.
gcloud_project projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role roles/run.builder --condition None >/dev/null

step "Conta de serviço do Cloud Run"
if ! exists gcloud_project iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL"; then
  gcloud_project iam service-accounts create "$SERVICE_ACCOUNT" --display-name "chat-tess (Cloud Run)"
fi
for role in roles/cloudsql.client roles/aiplatform.user roles/secretmanager.secretAccessor; do
  gcloud_project projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" --role "$role" --condition None >/dev/null
done

step "Cloud SQL (Postgres)"
if ! exists gcloud_project sql instances describe "$SQL_INSTANCE"; then
  gcloud_project sql instances create "$SQL_INSTANCE" \
    --database-version POSTGRES_17 \
    --edition ENTERPRISE \
    --tier "$SQL_TIER" \
    --region "$REGION" \
    --storage-size 10GB
fi
if ! exists gcloud_project sql databases describe "$DATABASE_NAME" --instance "$SQL_INSTANCE"; then
  gcloud_project sql databases create "$DATABASE_NAME" --instance "$SQL_INSTANCE"
fi

step "Usuário do banco e segredo com a URL de conexão"
if ! exists gcloud_project secrets describe "$DATABASE_URL_SECRET"; then
  database_password="$(openssl rand -hex 24)"
  gcloud_project sql users create "$DATABASE_USER" \
    --instance "$SQL_INSTANCE" --password "$database_password"

  # O Cloud Run acessa o Cloud SQL por socket Unix montado em /cloudsql.
  connection_name="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
  database_url="postgresql://${DATABASE_USER}:${database_password}@localhost/${DATABASE_NAME}?host=/cloudsql/${connection_name}"
  create_secret_if_missing "$DATABASE_URL_SECRET" "$database_url"
fi

step "Segredos da sessão e do OAuth"
create_secret_if_missing "$SESSION_SECRET_NAME" "$(openssl rand -base64 48)"
create_secret_if_missing "$OAUTH_SECRET_NAME" "$GOOGLE_OAUTH_CLIENT_SECRET"

step "Bucket de arquivos"
if ! exists gcloud_project storage buckets describe "gs://${BUCKET}"; then
  gcloud_project storage buckets create "gs://${BUCKET}" \
    --location "$REGION" --uniform-bucket-level-access --public-access-prevention
fi
gcloud_project storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" --role roles/storage.objectAdmin >/dev/null

step "Deploy no Cloud Run a partir do código local"
# Arquivo de variáveis em YAML: evita conflito das vírgulas de ALLOWED_EMAILS
# com o separador de --set-env-vars.
env_vars_file="$(mktemp)"
trap 'rm -f "$env_vars_file"' EXIT
cat >"$env_vars_file" <<YAML
PUBLIC_BASE_URL: "${SERVICE_URL}"
AUTH_MODE: "google"
GOOGLE_OAUTH_CLIENT_ID: "${GOOGLE_OAUTH_CLIENT_ID}"
ALLOWED_EMAILS: "${ALLOWED_EMAILS}"
ADMIN_EMAILS: "${ADMIN_EMAILS}"
LLM_MODE: "gemini"
GCP_PROJECT_ID: "${PROJECT_ID}"
GCP_LOCATION: "global"
FILE_STORAGE: "gcs"
GCS_BUCKET: "${BUCKET}"
YAML

gcloud_project run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$SERVICE_ACCOUNT_EMAIL" \
  --add-cloudsql-instances "${PROJECT_ID}:${REGION}:${SQL_INSTANCE}" \
  --env-vars-file "$env_vars_file" \
  --set-secrets "DATABASE_URL=${DATABASE_URL_SECRET}:latest,SESSION_SECRET=${SESSION_SECRET_NAME}:latest,GOOGLE_OAUTH_CLIENT_SECRET=${OAUTH_SECRET_NAME}:latest" \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 3600 \
  --min-instances 0 \
  --max-instances 2

step "Pronto"
echo "Serviço: ${SERVICE_URL}"
echo "Verificação: curl ${SERVICE_URL}/api/health/ready"
