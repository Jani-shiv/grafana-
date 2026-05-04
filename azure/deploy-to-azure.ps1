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

  [Parameter(Mandatory = $true)]
  [string]$StorageAccountName,

  [string]$ArtifactContainerName = 'stellarmind-artifacts',
  [string]$VmSize = 'Standard_B2s'
)

$ErrorActionPreference = 'Stop'

function Assert-CommandExists {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Install Azure CLI and try again."
  }
}

Assert-CommandExists -Name 'az'

if (-not (Test-Path $SshPublicKeyPath)) {
  throw "SSH public key file not found: $SshPublicKeyPath"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$stagingRoot = Join-Path $env:TEMP 'stellarmind-azure-deploy'
$archivePath = Join-Path $stagingRoot 'stellarmind.zip'
$cloudInitPath = Join-Path $stagingRoot 'cloud-init.yml'

if (Test-Path $stagingRoot) {
  Remove-Item $stagingRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $stagingRoot | Out-Null

$archiveItems = @(
  (Join-Path $repoRoot 'app.js'),
  (Join-Path $repoRoot 'package.json'),
  (Join-Path $repoRoot 'package-lock.json'),
  (Join-Path $repoRoot 'Dockerfile'),
  (Join-Path $repoRoot 'docker-compose.yml'),
  (Join-Path $repoRoot 'prometheus'),
  (Join-Path $repoRoot 'alertmanager'),
  (Join-Path $repoRoot 'grafana'),
  (Join-Path $repoRoot 'data'),
  (Join-Path $repoRoot 'README.md')
)

$existingItems = $archiveItems | Where-Object { Test-Path $_ }
Compress-Archive -Path $existingItems -DestinationPath $archivePath -Force

az account set --subscription $SubscriptionId

$storage = az storage account show --name $StorageAccountName --resource-group $ResourceGroupName --query name -o tsv 2>$null
if (-not $storage) {
  az group create --name $ResourceGroupName --location $Location | Out-Null
  az storage account create `
    --name $StorageAccountName `
    --resource-group $ResourceGroupName `
    --location $Location `
    --sku Standard_LRS `
    --kind StorageV2 | Out-Null
}

$storageKey = az storage account keys list `
  --account-name $StorageAccountName `
  --resource-group $ResourceGroupName `
  --query '[0].value' -o tsv

$containerExists = az storage container exists `
  --account-name $StorageAccountName `
  --account-key $storageKey `
  --name $ArtifactContainerName `
  --query exists -o tsv

if ($containerExists -ne 'true') {
  az storage container create `
    --account-name $StorageAccountName `
    --account-key $storageKey `
    --name $ArtifactContainerName | Out-Null
}

$artifactName = 'stellarmind.zip'
az storage blob upload `
  --account-name $StorageAccountName `
  --account-key $storageKey `
  --container-name $ArtifactContainerName `
  --name $artifactName `
  --file $archivePath `
  --overwrite true | Out-Null

$expiry = (Get-Date).ToUniversalTime().AddHours(6).ToString('yyyy-MM-ddTHH:mmZ')
$sasToken = az storage blob generate-sas `
  --account-name $StorageAccountName `
  --account-key $storageKey `
  --container-name $ArtifactContainerName `
  --name $artifactName `
  --permissions r `
  --expiry $expiry `
  -o tsv

$artifactUrl = "https://$StorageAccountName.blob.core.windows.net/$ArtifactContainerName/$artifactName?$sasToken"

$cloudInit = @"
#cloud-config
package_update: true
package_upgrade: true
packages:
  - ca-certificates
  - curl
  - gnupg
  - unzip
  - jq
runcmd:
  - [ sh, -c, 'install -m 0755 -d /etc/apt/keyrings' ]
  - [ sh, -c, 'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg' ]
  - [ sh, -c, 'chmod a+r /etc/apt/keyrings/docker.gpg' ]
  - [ sh, -c, 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list' ]
  - [ sh, -c, 'apt-get update' ]
  - [ sh, -c, 'apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin' ]
  - [ sh, -c, 'usermod -aG docker $AdminUsername || true' ]
  - [ sh, -c, 'mkdir -p /opt/stellarmind' ]
  - [ sh, -c, 'cd /opt/stellarmind && curl -fsSL "$artifactUrl" -o stellarmind.zip' ]
  - [ sh, -c, 'cd /opt/stellarmind && unzip -o stellarmind.zip' ]
  - [ sh, -c, 'cd /opt/stellarmind && docker compose up -d --build' ]
write_files:
  - path: /opt/stellarmind/.artifact-url
    permissions: '0644'
    content: |
      $artifactUrl
  - path: /etc/profile.d/stellarmind.sh
    permissions: '0644'
    content: |
      export STELLAR_MIND_HOME=/opt/stellarmind
"@

$cloudInit | Set-Content -Path $cloudInitPath -Encoding utf8

az group create --name $ResourceGroupName --location $Location | Out-Null

az vm create `
  --resource-group $ResourceGroupName `
  --name $VmName `
  --image Ubuntu2204 `
  --size $VmSize `
  --admin-username $AdminUsername `
  --ssh-key-values $SshPublicKeyPath `
  --custom-data $cloudInitPath `
  --public-ip-sku Standard `
  --nsg-rule SSH | Out-Null

$ports = @(3000, 3001, 9090, 9093, 9100)
foreach ($port in $ports) {
  az vm open-port `
    --resource-group $ResourceGroupName `
    --name $VmName `
    --port $port `
    --priority (1000 + $port) | Out-Null
}

$ip = az vm show `
  --resource-group $ResourceGroupName `
  --name $VmName `
  --show-details `
  --query publicIps -o tsv

Write-Host ''
Write-Host 'Azure VM created successfully.'
Write-Host "Public IP: $ip"
Write-Host "Grafana: http://$ip:3000"
Write-Host "Prometheus: http://$ip:9090"
Write-Host "Alertmanager: http://$ip:9093"
Write-Host "Node Exporter: http://$ip:9100"
Write-Host "Storefront: http://$ip:3000"
