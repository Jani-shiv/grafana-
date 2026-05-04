################################################################################
# STELLARMIND AZURE DEPLOYMENT SCRIPT
# Deploys Prometheus + Grafana + Node.js Ecommerce Stack to Azure VM
# Pulls code from GitHub: https://github.com/Jani-shiv/grafana-.git
################################################################################

param(
  [Parameter(Mandatory = $true)]
  [string]$SubscriptionId,

  [Parameter(Mandatory = $true)]
  [string]$ResourceGroupName,

  [Parameter(Mandatory = $true)]
  [string]$Location,

  [Parameter(Mandatory = $true)]
  [string]$VmName,

  [Parameter(Mandatory = $true)]
  [string]$AdminUsername,

  [Parameter(Mandatory = $true)]
  [string]$SshPublicKeyPath,

  [Parameter(Mandatory = $false)]
  [string]$StorageAccountName = "stellarmind$(Get-Random -Minimum 1000 -Maximum 9999)",

  [string]$ArtifactContainerName = 'stellarmind-artifacts',
  [string]$VmSize = 'Standard_B2s',
  [string]$GitHubRepo = 'https://github.com/Jani-shiv/grafana-.git'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'Continue'

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

function Write-Header {
  param([string]$Message)
  Write-Host ""
  Write-Host "╔$(New-Object String -ArgumentList 78, "═")╗" -ForegroundColor Cyan
  Write-Host "║ $Message$(New-Object String -ArgumentList (78 - $Message.Length), " ")║" -ForegroundColor Cyan
  Write-Host "╚$(New-Object String -ArgumentList 78, "═")╝" -ForegroundColor Cyan
  Write-Host ""
}

function Write-Step {
  param([string]$Message, [int]$StepNumber)
  Write-Host "[STEP $StepNumber] $Message" -ForegroundColor Green
}

function Write-Success {
  param([string]$Message)
  Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error-Custom {
  param([string]$Message)
  Write-Host "✗ ERROR: $Message" -ForegroundColor Red
}

function Assert-CommandExists {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Error-Custom "'$Name' not found. Install Azure CLI and try again."
    exit 1
  }
  Write-Success "Command '$Name' found"
}

# ============================================================================
# PRE-FLIGHT CHECKS
# ============================================================================

Write-Header "STELLARMIND AZURE DEPLOYMENT - PRE-FLIGHT CHECKS"

Write-Step "Checking required commands..." 1
Assert-CommandExists -Name 'az'
Assert-CommandExists -Name 'git'

Write-Step "Validating SSH key path..." 2
if (-not (Test-Path $SshPublicKeyPath)) {
  Write-Error-Custom "SSH public key not found: $SshPublicKeyPath"
  exit 1
}
Write-Success "SSH key found: $SshPublicKeyPath"

Write-Step "Checking Azure CLI authentication..." 3
$azAccount = az account show --query name -o tsv 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Error-Custom "Not authenticated to Azure. Run: az login"
  exit 1
}
Write-Success "Azure CLI authenticated: $azAccount"


# ============================================================================
# PREPARE DEPLOYMENT ARTIFACTS FROM GITHUB
# ============================================================================

Write-Header "PREPARING DEPLOYMENT ARTIFACTS FROM GITHUB"

$repoRoot = Split-Path -Parent $PSScriptRoot
$stagingRoot = Join-Path $env:TEMP 'stellarmind-azure-deploy'
$archivePath = Join-Path $stagingRoot 'stellarmind.zip'
$cloudInitPath = Join-Path $stagingRoot 'cloud-init.yml'
$gitClonePath = Join-Path $stagingRoot 'stellarmind-repo'

Write-Step "Cleaning staging directory..." 4
if (Test-Path $stagingRoot) {
  Remove-Item $stagingRoot -Recurse -Force | Out-Null
}
New-Item -ItemType Directory -Path $stagingRoot | Out-Null
Write-Success "Staging directory ready: $stagingRoot"

Write-Step "Cloning GitHub repository..." 5
git clone $GitHubRepo $gitClonePath --depth 1 --quiet
if ($LASTEXITCODE -ne 0) {
  Write-Error-Custom "Failed to clone GitHub repository"
  exit 1
}
Write-Success "Repository cloned from: $GitHubRepo"

Write-Step "Preparing archive for upload..." 6
$archiveItems = @(
  (Join-Path $gitClonePath 'app.js'),
  (Join-Path $gitClonePath 'package.json'),
  (Join-Path $gitClonePath 'package-lock.json'),
  (Join-Path $gitClonePath 'Dockerfile'),
  (Join-Path $gitClonePath 'docker-compose.yml'),
  (Join-Path $gitClonePath 'prometheus'),
  (Join-Path $gitClonePath 'alertmanager'),
  (Join-Path $gitClonePath 'grafana'),
  (Join-Path $gitClonePath 'data'),
  (Join-Path $gitClonePath 'README.md')
)

$existingItems = $archiveItems | Where-Object { Test-Path $_ }
Compress-Archive -Path $existingItems -DestinationPath $archivePath -Force -Quiet
Write-Success "Archive created: $archivePath"


# ============================================================================
# AZURE SUBSCRIPTION & RESOURCE GROUP SETUP
# ============================================================================

Write-Header "AZURE RESOURCE SETUP"

Write-Step "Setting subscription..." 7
az account set --subscription $SubscriptionId
if ($LASTEXITCODE -ne 0) {
  Write-Error-Custom "Failed to set subscription"
  exit 1
}
Write-Success "Subscription set: $SubscriptionId"

Write-Step "Creating resource group..." 8
az group create --name $ResourceGroupName --location $Location --output none
Write-Success "Resource group: $ResourceGroupName ($Location)"

# ============================================================================
# AZURE STORAGE ACCOUNT FOR ARTIFACTS
# ============================================================================

Write-Header "AZURE STORAGE SETUP"

Write-Step "Creating storage account..." 9
az storage account create `
  --name $StorageAccountName `
  --resource-group $ResourceGroupName `
  --location $Location `
  --sku Standard_LRS `
  --kind StorageV2 `
  --output none
Write-Success "Storage account created: $StorageAccountName"

Write-Step "Getting storage account key..." 10
$storageKey = az storage account keys list `
  --account-name $StorageAccountName `
  --resource-group $ResourceGroupName `
  --query '[0].value' -o tsv
Write-Success "Storage key retrieved"

Write-Step "Creating artifact container..." 11
az storage container create `
  --account-name $StorageAccountName `
  --account-key $storageKey `
  --name $ArtifactContainerName `
  --output none
Write-Success "Container created: $ArtifactContainerName"

Write-Step "Uploading deployment archive..." 12
az storage blob upload `
  --account-name $StorageAccountName `
  --account-key $storageKey `
  --container-name $ArtifactContainerName `
  --name 'stellarmind.zip' `
  --file $archivePath `
  --overwrite `
  --output none
Write-Success "Archive uploaded to Azure Storage"

Write-Step "Generating SAS token..." 13
$expiry = (Get-Date).ToUniversalTime().AddHours(6).ToString('yyyy-MM-ddTHH:mmZ')
$sasToken = az storage blob generate-sas `
  --account-name $StorageAccountName `
  --account-key $storageKey `
  --container-name $ArtifactContainerName `
  --name 'stellarmind.zip' `
  --permissions r `
  --expiry $expiry `
  -o tsv
Write-Success "SAS token generated (6-hour expiry)"

$artifactUrl = "https://$StorageAccountName.blob.core.windows.net/$ArtifactContainerName/stellarmind.zip?$sasToken"


# ============================================================================
# CLOUD-INIT CONFIGURATION
# ============================================================================

Write-Header "GENERATING CLOUD-INIT SCRIPT"

Write-Step "Creating cloud-init configuration..." 14

# Escape the artifact URL for cloud-init
$artifactUrlEscaped = $artifactUrl -replace '\$', '\$'

$cloudInit = @"
#!/bin/bash
set -e

# Logging
exec > >(tee -a /var/log/stellarmind-deploy.log)
exec 2>&1

echo "=========================================="
echo "STELLARMIND AZURE DEPLOYMENT - STARTING"
echo "=========================================="
echo "Timestamp: \$(date)"

# Update system
echo "[1/10] Updating system packages..."
apt-get update
apt-get upgrade -y

# Install dependencies
echo "[2/10] Installing dependencies..."
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  git \
  unzip \
  jq \
  wget

# Install Docker
echo "[3/10] Installing Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \$(. /etc/os-release && echo \$VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Configure Docker user
echo "[4/10] Configuring Docker permissions..."
usermod -aG docker $AdminUsername || true

# Create application directory
echo "[5/10] Creating application directory..."
mkdir -p /opt/stellarmind
cd /opt/stellarmind

# Download and extract deployment archive
echo "[6/10] Downloading deployment archive from Azure Storage..."
curl -fsSL "$artifactUrlEscaped" -o stellarmind.zip
if [ ! -f stellarmind.zip ]; then
  echo "ERROR: Failed to download deployment archive"
  exit 1
fi

echo "[7/10] Extracting deployment files..."
unzip -o stellarmind.zip -q

# List extracted files
echo "Extracted files:"
ls -lah /opt/stellarmind/

# Install npm dependencies
echo "[8/10] Installing Node.js dependencies..."
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

# Build and start containers
echo "[9/10] Building and starting Docker Compose stack..."
docker compose up -d --build
sleep 10

# Verify deployment
echo "[10/10] Verifying deployment..."
RETRIES=0
MAX_RETRIES=30
while [ \$RETRIES -lt \$MAX_RETRIES ]; do
  if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    echo "✓ Application health check passed"
    break
  fi
  RETRIES=\$((RETRIES + 1))
  echo "Waiting for application to be ready... (\$RETRIES/\$MAX_RETRIES)"
  sleep 2
done

if [ \$RETRIES -eq \$MAX_RETRIES ]; then
  echo "WARNING: Application health check timeout, but Docker stack is running"
fi

# Final status
echo ""
echo "=========================================="
echo "STELLARMIND DEPLOYMENT COMPLETE"
echo "=========================================="
echo "Timestamp: \$(date)"
echo "Application is running at: http://localhost:3000"
echo "See /var/log/stellarmind-deploy.log for details"
echo ""
docker compose ps
"@

$cloudInit | Set-Content -Path $cloudInitPath -Encoding utf8
Write-Success "Cloud-init script generated: $cloudInitPath"

# ============================================================================
# AZURE VM CREATION
# ============================================================================

Write-Header "CREATING AZURE VIRTUAL MACHINE"

Write-Step "Creating Azure VM (this may take 3-5 minutes)..." 15
Write-Host "  Image: Ubuntu 22.04 LTS" -ForegroundColor Gray
Write-Host "  Size: $VmSize" -ForegroundColor Gray
Write-Host "  Admin: $AdminUsername" -ForegroundColor Gray

az vm create `
  --resource-group $ResourceGroupName `
  --name $VmName `
  --image Ubuntu2204 `
  --size $VmSize `
  --admin-username $AdminUsername `
  --ssh-key-values $SshPublicKeyPath `
  --custom-data $cloudInitPath `
  --public-ip-sku Standard `
  --nsg-rule SSH `
  --output none

Write-Success "Virtual machine created: $VmName"

# ============================================================================
# CONFIGURE NETWORK SECURITY
# ============================================================================

Write-Header "CONFIGURING NETWORK SECURITY"

Write-Step "Opening application ports..." 16
$ports = @(
  @{port = 3000; description = "Grafana & Storefront"},
  @{port = 3001; description = "Node App"},
  @{port = 9090; description = "Prometheus"},
  @{port = 9093; description = "Alertmanager"},
  @{port = 9100; description = "Node Exporter"}
)

foreach ($portConfig in $ports) {
  $port = $portConfig.port
  $desc = $portConfig.description
  az vm open-port `
    --resource-group $ResourceGroupName `
    --name $VmName `
    --port $port `
    --priority (1000 + $port) `
    --output none
  Write-Success "Port $port open ($desc)"
}

# ============================================================================
# RETRIEVE VM DETAILS
# ============================================================================

Write-Header "DEPLOYMENT SUMMARY"

Write-Step "Retrieving VM public IP address..." 17
$vmDetails = az vm show `
  --resource-group $ResourceGroupName `
  --name $VmName `
  --show-details `
  --query "{ip: publicIps, fqdn: fqdns}" -o json | ConvertFrom-Json

$ip = $vmDetails.ip
$fqdn = $vmDetails.fqdn

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    ✓ DEPLOYMENT SUCCESSFUL!                                    ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Write-Host "RESOURCE GROUP:     $ResourceGroupName" -ForegroundColor Cyan
Write-Host "VIRTUAL MACHINE:    $VmName" -ForegroundColor Cyan
Write-Host "PUBLIC IP:          $ip" -ForegroundColor Cyan
Write-Host "FQDN:               $fqdn" -ForegroundColor Cyan
Write-Host ""

Write-Host "┌─ SERVICE ENDPOINTS ─────────────────────────────────────────────────────────────┐" -ForegroundColor Yellow
Write-Host "│" -ForegroundColor Yellow
Write-Host "│  🟢 Grafana (Prometheus Dashboards)" -ForegroundColor Green
Write-Host "│     ➜ http://$ip:3000" -ForegroundColor Green
Write-Host "│     ➜ http://$fqdn:3000" -ForegroundColor Green
Write-Host "│     Login: admin / admin" -ForegroundColor Green
Write-Host "│" -ForegroundColor Yellow
Write-Host "│  🛒 Ecommerce Storefront" -ForegroundColor Cyan
Write-Host "│     ➜ http://$ip:3000" -ForegroundColor Cyan
Write-Host "│     ➜ http://$fqdn:3000" -ForegroundColor Cyan
Write-Host "│" -ForegroundColor Yellow
Write-Host "│  📊 Prometheus (Metrics)" -ForegroundColor Magenta
Write-Host "│     ➜ http://$ip:9090" -ForegroundColor Magenta
Write-Host "│     ➜ http://$fqdn:9090" -ForegroundColor Magenta
Write-Host "│" -ForegroundColor Yellow
Write-Host "│  🚨 Alertmanager" -ForegroundColor Red
Write-Host "│     ➜ http://$ip:9093" -ForegroundColor Red
Write-Host "│     ➜ http://$fqdn:9093" -ForegroundColor Red
Write-Host "│" -ForegroundColor Yellow
Write-Host "│  ⚙️  Node Exporter" -ForegroundColor Yellow
Write-Host "│     ➜ http://$ip:9100" -ForegroundColor Yellow
Write-Host "│     ➜ http://$fqdn:9100" -ForegroundColor Yellow
Write-Host "│" -ForegroundColor Yellow
Write-Host "└─────────────────────────────────────────────────────────────────────────────────┘" -ForegroundColor Yellow
Write-Host ""

Write-Host "📚 DOCUMENTATION:" -ForegroundColor Cyan
Write-Host "   README: https://github.com/Jani-shiv/grafana-.git" -ForegroundColor Cyan
Write-Host "   GitHub: https://github.com/Jani-shiv/grafana-.git" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔧 SSH ACCESS:" -ForegroundColor Cyan
Write-Host "   ssh $AdminUsername@$ip" -ForegroundColor Cyan
Write-Host "   ssh $AdminUsername@$fqdn" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 DEPLOYMENT LOGS ON VM:" -ForegroundColor Cyan
Write-Host "   ssh $AdminUsername@$ip 'tail -f /var/log/stellarmind-deploy.log'" -ForegroundColor Cyan
Write-Host ""

Write-Host "🐳 DOCKER COMPOSE STATUS:" -ForegroundColor Cyan
Write-Host "   ssh $AdminUsername@$ip 'cd /opt/stellarmind && docker compose ps'" -ForegroundColor Cyan
Write-Host ""

Write-Host "💡 NEXT STEPS:" -ForegroundColor Yellow
Write-Host "   1. Wait 2-3 minutes for Docker containers to fully initialize" -ForegroundColor Yellow
Write-Host "   2. Open http://$ip:3000 in your browser" -ForegroundColor Yellow
Write-Host "   3. Access Grafana dashboard (admin/admin)" -ForegroundColor Yellow
Write-Host "   4. Generate ecommerce traffic by making purchases" -ForegroundColor Yellow
Write-Host "   5. View metrics and alerts in Grafana and Prometheus" -ForegroundColor Yellow
Write-Host ""
