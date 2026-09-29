#!/usr/bin/env bash
#
# Provisiona a infraestrutura do chat-tess no Google Cloud e faz o primeiro deploy.
#
# ATENÇÃO: cria recursos que geram custo (Cloud SQL é cobrado por hora).
# Leia o script antes de executar. Ele pode ser executado mais de uma vez:
# recursos que já existem são mantidos.
#
# Uso:
#   PROJECT_ID=meu-projeto ./infra/provision.sh
#
# Pré-requisitos: gcloud autenticado e faturamento ativo no projeto.

set -euo pipefail

: "${PROJECT_ID:?Defina PROJECT_ID com o ID do projeto no Google Cloud}"
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

gcloud_project() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
step() { printf '\n==> %s\n' "$1"; }
exists() { "$@" >/dev/null 2>&1; }

step "Habilitando as APIs"
gcloud_project services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com

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
  printf '%s' "$database_url" |
    gcloud_project secrets create "$DATABASE_URL_SECRET" --data-file=- --replication-policy automatic
fi

step "Bucket de arquivos"
if ! exists gcloud_project storage buckets describe "gs://${BUCKET}"; then
  gcloud_project storage buckets create "gs://${BUCKET}" \
    --location "$REGION" --uniform-bucket-level-access --public-access-prevention
fi
gcloud_project storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" --role roles/storage.objectAdmin >/dev/null

step "Deploy no Cloud Run a partir do código local"
gcloud_project run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$SERVICE_ACCOUNT_EMAIL" \
  --add-cloudsql-instances "${PROJECT_ID}:${REGION}:${SQL_INSTANCE}" \
  --set-secrets "DATABASE_URL=${DATABASE_URL_SECRET}:latest" \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 3600 \
  --min-instances 0 \
  --max-instances 2

step "Pronto"
service_url="$(gcloud_project run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
echo "Serviço: ${service_url}"
echo "Verificação: curl ${service_url}/api/health/ready"
