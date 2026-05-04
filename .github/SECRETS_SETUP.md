# GitHub Actions Secrets Setup

This file explains all the secrets needed for the CI/CD pipeline to work properly.

## 📋 Required Secrets

### 1. Docker Hub (Optional - only if pushing to Docker Hub)

**Secrets to add:**
- `DOCKER_HUB_USERNAME` - Your Docker Hub username
- `DOCKER_HUB_TOKEN` - Docker Hub personal access token

**How to create Docker Hub token:**
1. Go to https://hub.docker.com/settings/security
2. Click "New Access Token"
3. Name it "github-actions"
4. Select "Read & Write" permissions
5. Copy the token

**GitHub UI:**
- Settings → Secrets and variables → Actions
- Click "New repository secret"
- Add `DOCKER_HUB_USERNAME` and `DOCKER_HUB_TOKEN`

---

### 2. Azure Deployment (Required for Azure workflows)

#### 2.1 Azure Subscription Details

**Secrets to add:**
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_VM_NAME`
- `AZURE_LOCATION`
- `AZURE_VM_ADMIN_USER`
- `AZURE_CREDENTIALS` (JSON)
- `AZURE_VM_SSH_PRIVATE_KEY` (base64)

#### 2.2 Get Azure Subscription ID

```powershell
# PowerShell
az account show --query id -o tsv

# Output: 12345678-1234-1234-1234-123456789abc
```

#### 2.3 Create Azure Service Principal

```powershell
# Create service principal with Contributor role
$sp = az ad sp create-for-rbac `
  --name "github-actions-stellarmind" `
  --role "Contributor" `
  --scopes "/subscriptions/YOUR_SUBSCRIPTION_ID"

# Display the JSON
$sp | ConvertTo-Json

# Copy entire JSON output
```

**Store the JSON as `AZURE_CREDENTIALS` secret:**

```json
{
  "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "subscriptionId": "12345678-1234-1234-1234-123456789abc",
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

#### 2.4 SSH Key for VM Access

**Generate SSH key (if you don't have one):**

```bash
# Create 4096-bit RSA key
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""

# Output: ~/.ssh/id_rsa (private) and ~/.ssh/id_rsa.pub (public)
```

**Encode private key for GitHub secret:**

```bash
# Linux/Mac
cat ~/.ssh/id_rsa | base64 -w 0

# PowerShell
$content = Get-Content -Path $env:USERPROFILE\.ssh\id_rsa -Raw
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($content))
$encoded | Set-Clipboard
```

**Store the base64-encoded private key as `AZURE_VM_SSH_PRIVATE_KEY`**

#### 2.5 Azure Resource Configuration

```
AZURE_SUBSCRIPTION_ID = "12345678-1234-1234-1234-123456789abc"
AZURE_RESOURCE_GROUP = "stellarmind-prod"
AZURE_VM_NAME = "stellarmind-vm"
AZURE_LOCATION = "eastus"  # Other options: westeurope, southcentralus, eastasia, uksouth
AZURE_VM_ADMIN_USER = "azureuser"
```

---

### 3. Security Scanning (Optional)

#### Snyk Token

**To enable Snyk scanning:**
1. Go to https://snyk.io and sign up
2. Get your API token from Settings
3. Add as `SNYK_TOKEN` secret

---

## ✅ Checklist: Secrets Setup

- [ ] `DOCKER_HUB_USERNAME` (optional)
- [ ] `DOCKER_HUB_TOKEN` (optional)
- [ ] `AZURE_SUBSCRIPTION_ID`
- [ ] `AZURE_RESOURCE_GROUP`
- [ ] `AZURE_VM_NAME`
- [ ] `AZURE_LOCATION`
- [ ] `AZURE_VM_ADMIN_USER`
- [ ] `AZURE_CREDENTIALS` (JSON)
- [ ] `AZURE_VM_SSH_PRIVATE_KEY` (base64)
- [ ] `SNYK_TOKEN` (optional)

---

## 🔐 Verifying Secrets

After adding secrets, verify they're accessible (GitHub doesn't show the values):

```bash
# Verify secrets are available to workflows
# (This appears in GitHub Actions logs)
- name: Verify secrets
  run: |
    [ -n "${{ secrets.AZURE_SUBSCRIPTION_ID }}" ] && echo "✓ AZURE_SUBSCRIPTION_ID set"
    [ -n "${{ secrets.DOCKER_HUB_TOKEN }}" ] && echo "✓ DOCKER_HUB_TOKEN set"
```

---

## 🆘 Troubleshooting

### "Unauthorized: authentication required"
- Check Azure credentials JSON is valid
- Verify service principal has "Contributor" role

### "SSH permission denied"
- Verify SSH private key is base64-encoded correctly
- Check public key is added to Azure VM

### "Docker Hub authentication failed"
- Verify Docker Hub token is fresh (not expired)
- Check token has "Read & Write" permissions

---

## 🔒 Security Best Practices

1. **Rotate secrets periodically** (every 90 days)
2. **Use service principals** for Azure (not user credentials)
3. **Limit permissions** to only what's needed
4. **Never commit secrets** to git
5. **Monitor secret usage** in GitHub Action logs
6. **Delete old secrets** when they expire

---

## 📚 Additional Resources

- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
- [Azure Service Principal Guide](https://learn.microsoft.com/en-us/cli/azure/create-an-azure-service-principal-azure-cli)
- [Snyk Documentation](https://docs.snyk.io/getting-started)
- [Docker Hub API](https://docs.docker.com/docker-hub/api/latest/)
