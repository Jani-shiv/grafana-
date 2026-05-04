################################################################################
# CI/CD PIPELINE DOCUMENTATION
# Complete guide to GitHub Actions workflows and deployment automation
################################################################################

# 📊 STELLARMIND CI/CD PIPELINE GUIDE

## 🎯 Overview

The Stellarmind project includes a **production-grade CI/CD pipeline** with:

- ✅ **Automated Code Quality Checks** (ESLint, Prettier)
- ✅ **Unit Testing** (Jest)
- ✅ **Security Scanning** (CodeQL, Trivy, SAST)
- ✅ **Docker Image Building & Pushing**
- ✅ **Automated Azure Deployment**
- ✅ **Release Management**
- ✅ **Dependency Auditing**

---

## 🔧 Workflows Included

### 1. **CI - Code Quality & Testing** (`ci.yml`)

**Triggers:** Push to main/master/develop, Pull requests

**Jobs:**
- 🔍 **Lint**: ESLint + Prettier formatting checks
- ✅ **Test**: Jest unit tests with coverage reporting
- 🔒 **Security**: npm audit + Snyk scanning
- 🏗️ **Build**: Node.js syntax validation + Docker build test

**Success Criteria:**
- All ESLint checks pass
- Test coverage meets thresholds
- No high-severity security vulnerabilities
- Docker image builds successfully

---

### 2. **Docker Build & Push** (`docker-push.yml`)

**Triggers:** Push to main/master, Version tags (v*.*.*)

**Registries:**
- 🐳 **Docker Hub** (if credentials configured)
- 📦 **GitHub Container Registry** (GHCR) - always enabled

**Features:**
- Layer caching for faster builds
- Multi-platform builds (amd64, arm64)
- Automatic versioning based on git tags
- SBOM (Software Bill of Materials) generation

**Images Published To:**
```
ghcr.io/jani-shiv/grafana-:latest
ghcr.io/jani-shiv/grafana-:v1.0.0
ghcr.io/jani-shiv/grafana-:main-abc123def
```

---

### 3. **Security Scanning** (`security.yml`)

**Triggers:** Push, Pull requests, Daily schedule (2 AM UTC)

**Scans:**
- 🔍 **Dependency Check**: npm audit for vulnerable packages
- 🔐 **CodeQL**: GitHub's static analysis (detects code vulnerabilities)
- 🐳 **Container Scan**: Trivy scans Docker image for CVEs
- 🛡️ **SAST**: Security-focused ESLint rules
- 🏗️ **Infrastructure**: Checkov scans Dockerfile and YAML configs

**Reports Published To:**
- GitHub Security tab (Code scanning alerts)
- GitHub Actions artifacts (audit reports)

---

### 4. **Automated Azure Deployment** (`deploy-azure.yml`)

**Triggers:** Push to main/master branch, Manual workflow dispatch

**Requires GitHub Secrets:**
```
AZURE_SUBSCRIPTION_ID          # Your Azure subscription ID
AZURE_RESOURCE_GROUP           # Azure resource group name
AZURE_VM_NAME                  # VM hostname
AZURE_LOCATION                 # Azure region (e.g., eastus)
AZURE_CREDENTIALS              # Azure service principal credentials (JSON)
AZURE_VM_ADMIN_USER            # SSH admin username
AZURE_VM_SSH_PRIVATE_KEY       # SSH private key (base64 encoded)
```

**Deployment Steps:**
1. Prepare deployment artifacts
2. Login to Azure
3. Upload code to VM via SCP
4. Build Docker images on VM
5. Start Docker Compose stack
6. Verify service health
7. Rollback on failure

**Output:**
- Grafana URL: `http://<VM-IP>:3000`
- Prometheus URL: `http://<VM-IP>:9090`
- Alertmanager URL: `http://<VM-IP>:9093`

---

### 5. **Release Management** (`release.yml`)

**Triggers:** Version tags (v*.*.*)

**Actions:**
- 📦 Creates GitHub Release
- 📝 Generates changelog
- 🐳 Builds and pushes Docker image with version tag
- 📄 Creates SBOM artifact
- 📚 Updates CHANGELOG.md

**Example:**
```bash
git tag v1.0.0
git push origin v1.0.0
# Automatically triggers release workflow
```

---

## 🔑 Setting Up Secrets

### GitHub Secrets Configuration

1. Go to: **Settings** → **Secrets and variables** → **Actions**

2. Add these secrets:

#### Docker Hub (Optional)
```
DOCKER_HUB_USERNAME=your_docker_username
DOCKER_HUB_TOKEN=your_docker_personal_access_token
```

#### Azure Deployment
```
AZURE_SUBSCRIPTION_ID=12345678-1234-1234-1234-123456789abc
AZURE_RESOURCE_GROUP=stellarmind-prod
AZURE_VM_NAME=stellarmind-vm
AZURE_LOCATION=eastus
AZURE_VM_ADMIN_USER=azureuser
```

#### Azure Service Principal (AZURE_CREDENTIALS)

Create service principal:
```powershell
# PowerShell
$sp = az ad sp create-for-rbac `
  --name "github-actions-stellarmind" `
  --role "Contributor" `
  --scopes "/subscriptions/YOUR_SUBSCRIPTION_ID"

$sp | ConvertTo-Json
```

Then store the JSON output as `AZURE_CREDENTIALS` secret.

#### SSH Keys for Azure Deployment
```bash
# Generate SSH key if needed
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa

# Encode private key (base64)
cat ~/.ssh/id_rsa | base64 -w 0

# Copy output to AZURE_VM_SSH_PRIVATE_KEY secret
```

#### Security Scanning
```
SNYK_TOKEN=your_snyk_api_token  (Optional)
```

---

## 📋 Scripts Available

Run these locally to validate before committing:

```bash
# Run all validations
npm run validate

# Lint code
npm run lint
npm run lint:fix

# Format code
npm run format
npm run format:check

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Security checks
npm run security:audit
npm run security:audit:fix

# Docker operations
npm run docker:build
npm run docker:run
```

---

## 🚀 Deployment Workflow

### Automatic Deployment Process

```
1. Developer pushes code to main/master
                    ↓
2. GitHub Actions triggers CI workflow
   - Lint code ✓
   - Run tests ✓
   - Security scan ✓
   - Build Docker image ✓
                    ↓
3. If all CI checks pass, triggers deployment
   - Upload code to Azure VM
   - Build & restart containers
   - Health checks
   - Verify endpoints
                    ↓
4. If deployment fails, automatic rollback
   - Revert to previous known-good version
   - Notify team
                    ↓
5. Success notification with service URLs
```

### Manual Deployment

If automatic deployment fails, deploy manually:

```bash
# 1. SSH to VM
ssh azureuser@<VM-IP>

# 2. Navigate to app directory
cd /opt/stellarmind

# 3. Pull latest code
git pull origin master

# 4. Rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d

# 5. Check status
docker compose ps
```

---

## 📊 Monitoring CI/CD

### View Workflow Status

1. Go to: **Actions** tab on GitHub
2. Select workflow from the list
3. View job status and logs

### Access Logs

**ESLint output:** GitHub Actions logs
**Test coverage:** GitHub Actions artifacts
**Security reports:** GitHub Security tab → Code scanning alerts
**Docker builds:** GitHub Actions logs

---

## 🐛 Troubleshooting CI/CD

### CI Pipeline Failing

**Check ESLint:**
```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

**Check Tests:**
```bash
npm test
npm run test:watch  # Debug mode
```

**Check Docker Build:**
```bash
npm run docker:build
```

### Deployment Failing

**Check Secrets:**
- Verify all required secrets are set
- Ensure AZURE_CREDENTIALS is valid JSON

**Check Logs:**
```bash
# SSH to VM
ssh azureuser@<VM-IP>

# View deployment logs
tail -f /var/log/stellarmind-deploy.log

# Check Docker status
docker compose ps
docker compose logs
```

---

## 🔄 Version Management

### Semantic Versioning

```
v1.2.3
│ │ │
│ │ └─ Patch (bug fixes)
│ └─── Minor (new features)
└───── Major (breaking changes)
```

### Creating a Release

```bash
# 1. Update version in package.json
# 2. Commit changes
git add package.json
git commit -m "chore: bump version to 1.1.0"

# 3. Create and push version tag
git tag v1.1.0
git push origin main
git push origin v1.1.0

# 4. GitHub Actions automatically:
#    - Creates release
#    - Builds Docker image with version tag
#    - Generates SBOM
#    - Updates changelog
```

---

## 📈 Performance Optimization

### Docker Layer Caching

The workflows use Docker layer caching to speed up builds:

```dockerfile
# Cached layers are reused automatically
COPY package*.json ./
RUN npm ci --omit=dev
COPY app.js .
```

### GitHub Actions Caching

Node dependencies are cached:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'  # Automatically caches node_modules
```

---

## 🔐 Security Best Practices

1. **Keep secrets secure:**
   - Never commit secrets to git
   - Use GitHub secrets for sensitive data
   - Rotate credentials regularly

2. **Code review:**
   - Require pull request reviews
   - Use CODEOWNERS for automatic assignment

3. **Dependency management:**
   - Run npm audit regularly
   - Update dependencies promptly
   - Review security advisories

4. **Container security:**
   - Scan images for vulnerabilities (Trivy)
   - Use minimal base images
   - Don't run as root in containers

---

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Azure CLI Reference](https://learn.microsoft.com/en-us/cli/azure/)
- [ESLint Configuration](https://eslint.org/docs/rules/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Code style
- Testing requirements
- Pull request process
- Commit message format

---

**Last Updated:** 2026-05-04
**Maintainer:** Stellarmind Team
