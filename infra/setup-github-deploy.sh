#!/usr/bin/env bash
#
# Dá ao GitHub Actions permissão para publicar o chat-tess no Cloud Run.
#
# A autenticação usa Workload Identity Federation: o GitHub apresenta um token
# OIDC da execução do workflow e recebe credenciais temporárias. Nenhuma chave de
# service account é criada nem guardada no GitHub. Só workflows do repositório
# informado em GITHUB_REPOSITORY conseguem assumir a conta de deploy.
#
# Rode depois de infra/provision.sh. Pode ser executado mais de uma vez.
#
# Uso:
#   GITHUB_REPOSITORY=dono/repo ./infra/setup-github-deploy.sh
#
# Com o gh autenticado, as variáveis que o workflow lê são gravadas no repositório.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
: "${PROJECT_ID:?Defina PROJECT_ID ou selecione um projeto com gcloud config set project}"
: "${GITHUB_REPOSITORY:?Defina GITHUB_REPOSITORY no formato dono/repo}"
REGION="${REGION:-southamerica-east1}"
SERVICE="${SERVICE:-chat-tess}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-chat-tess}"
POOL="github"
PROVIDER="github-actions"
DEPLOYER="${SERVICE}-deployer"
DEPLOYER_EMAIL="${DEPLOYER}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_EMAIL="${SERVICE}-run@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud_project() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
step() { printf '\n==> %s\n' "$1"; }
exists() { "$@" >/dev/null 2>&1; }

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"

step "Habilitando as APIs"
gcloud_project services enable iamcredentials.googleapis.com sts.googleapis.com

step "Repositório de imagens no Artifact Registry"
if ! exists gcloud_project artifacts repositories describe "$IMAGE_REPOSITORY" --location "$REGION"; then
  gcloud_project artifacts repositories create "$IMAGE_REPOSITORY" \
    --repository-format docker --location "$REGION" \
    --description "Imagens do chat-tess publicadas pelo GitHub Actions"
fi

step "Conta de serviço de deploy"
if ! exists gcloud_project iam service-accounts describe "$DEPLOYER_EMAIL"; then
  gcloud_project iam service-accounts create "$DEPLOYER" --display-name "chat-tess (deploy pelo GitHub)"
fi
# Envia imagens só para este repositório de imagens.
gcloud_project artifacts repositories add-iam-policy-binding "$IMAGE_REPOSITORY" \
  --location "$REGION" \
  --member "serviceAccount:${DEPLOYER_EMAIL}" --role roles/artifactregistry.writer >/dev/null
# Publica revisões só neste serviço.
gcloud_project run services add-iam-policy-binding "$SERVICE" \
  --region "$REGION" \
  --member "serviceAccount:${DEPLOYER_EMAIL}" --role roles/run.developer >/dev/null
# A revisão roda com a conta do serviço; o deploy precisa poder atribuí-la.
gcloud_project iam service-accounts add-iam-policy-binding "$RUNTIME_EMAIL" \
  --member "serviceAccount:${DEPLOYER_EMAIL}" --role roles/iam.serviceAccountUser >/dev/null

step "Workload Identity Federation para o GitHub"
if ! exists gcloud_project iam workload-identity-pools describe "$POOL" --location global; then
  gcloud_project iam workload-identity-pools create "$POOL" \
    --location global --display-name "GitHub Actions"
fi
if ! exists gcloud_project iam workload-identity-pools providers describe "$PROVIDER" \
  --location global --workload-identity-pool "$POOL"; then
  gcloud_project iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location global \
    --workload-identity-pool "$POOL" \
    --display-name "GitHub Actions" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository == '${GITHUB_REPOSITORY}'"
fi
# Só execuções deste repositório assumem a conta de deploy.
pool_resource="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"
gcloud_project iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" \
  --member "principalSet://iam.googleapis.com/${pool_resource}/attribute.repository/${GITHUB_REPOSITORY}" \
  --role roles/iam.workloadIdentityUser >/dev/null

WORKLOAD_IDENTITY_PROVIDER="${pool_resource}/providers/${PROVIDER}"

step "Variáveis do workflow no GitHub"
set_workflow_variable() {
  local name="$1" value="$2"
  if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    gh variable set "$name" --repo "$GITHUB_REPOSITORY" --body "$value"
  else
    echo "Defina no GitHub: ${name}=${value}"
  fi
}
set_workflow_variable GCP_PROJECT_ID "$PROJECT_ID"
set_workflow_variable GCP_REGION "$REGION"
set_workflow_variable CLOUD_RUN_SERVICE "$SERVICE"
set_workflow_variable IMAGE_REPOSITORY "$IMAGE_REPOSITORY"
set_workflow_variable GCP_DEPLOYER_SERVICE_ACCOUNT "$DEPLOYER_EMAIL"
set_workflow_variable GCP_WORKLOAD_IDENTITY_PROVIDER "$WORKLOAD_IDENTITY_PROVIDER"

step "Pronto"
echo "Push na main publica uma revisão nova depois que os testes passarem."
